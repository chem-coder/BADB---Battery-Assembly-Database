Attribute VB_Name = "modImportStages"
' ===========================
'   modImportStages.bas
'   Загрузка Этап_* на Служебный_лист
'   Учёт прав доступа по личному паролю (SEC_EMP_HASH)
'   Дубликаты: глобальная политика (Skip/Merge/New для всех)
' ===========================
Option Explicit

Private Const SVC_SHEET As String = "Служебный_лист"

' --- Привязка к системе ролей ---
Private Const ROLE_EMPLOYEE As Long = 1
Private Const ROLE_MANAGER  As Long = 2

' Имя Name с хэшем пароля сотрудника в каждой книге
Private Const NAME_EMP_HASH As String = "SEC_EMP_HASH"

' --- Тюнинг копирования ---
Private Const COPY_FORMATS    As Boolean = True
Private Const COPY_VALIDATION As Boolean = True

Private Enum DupAction
    daSkip = 0    ' пропустить этот экземпляр
    daMerge = 1   ' объединить с существующим этапом
    daNew = 2     ' новый этап: ЛОГИЧЕСКОЕ_ИМЯ_суффикс
End Enum

Private Enum ImportSource
    srcNone = 0
    srcLocalSheet = 1
    srcExternalFiles = 2
    srcFolder = 3
End Enum

' --- Глобальное состояние на время одной загрузки ---

' Уже существующие ЭТАПЫ на Служебный_лист:
'   ключ = LCase(логическое_имя)
'   значение = ListObject
Private gExistingStages As Object   ' Scripting.Dictionary

' Политика по дубликатам для КОНКРЕТНОГО логического этапа
' (оставлена на случай, если понадобится более тонкая логика)
Private gDupPolicy As Object        ' Scripting.Dictionary
Private gDupNewName As Object       ' Scripting.Dictionary

' Глобальная политика по ВСЕМ дубликатам (любой этап)
Private gDupGlobalPolicySet As Boolean
Private gDupGlobalPolicy As DupAction
Private gDupGlobalNewSuffix As String

' Последний использованный суффикс (по умолчанию "импорт")
Private gDupSuffixDefault As String

' Глобовый флаг: если True — прерываем все циклы загрузки
Private gAbortImport As Boolean

' ======================= ЛОГ В IMMEDIATE =======================

Private Sub Dbg(ByVal msg As String)
    Debug.Print Format$(Now, "yyyy-mm-dd hh:nn:ss"), Space$(5), msg
End Sub

' ==================== ТОЧКА ВХОДА ДЛЯ КНОПКИ ====================

Public Sub Загрузить_Данные()
    Dim src As ImportSource
    Dim wsSvc As Worksheet
    Dim wsSrc As Worksheet
    Dim oldEvents As Boolean, oldCalc As XlCalculation
    Dim oldAlerts As Boolean, oldScreen As Boolean

    On Error GoTo ErrHandler

    ' Проверка, что пользователь залогинен
    If Not UserCanImport() Then Exit Sub

    ' Если на Дорожная_карта (или другом листе с "Отображение")
    ' сейчас вырезан этап / Таблица ID / список этапов —
    ' сначала вернуть таблицу на родной лист (в т. ч. Этап_* на Служебный_лист)
    On Error Resume Next
    Вернуть_Отображаемый_Блок_Если_Нужно
    On Error GoTo ErrHandler
    Set wsSvc = ThisWorkbook.Worksheets(SVC_SHEET)
    ' дальше код без изменений...


    ' Инициализируем глобальное состояние
    gDupSuffixDefault = "импорт"
    Set gExistingStages = Nothing
    Set gDupPolicy = CreateObject("Scripting.Dictionary")
    Set gDupNewName = CreateObject("Scripting.Dictionary")
    gAbortImport = False

    gDupGlobalPolicySet = False
    gDupGlobalPolicy = daSkip
    gDupGlobalNewSuffix = ""

    ' Сохраняем окружение Excel
    oldEvents = Application.EnableEvents
    oldCalc = Application.Calculation
    oldAlerts = Application.DisplayAlerts
    oldScreen = Application.ScreenUpdating

    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual
    Application.DisplayAlerts = False
    Application.ScreenUpdating = False

    Dbg "Загрузить_Данные: старт"

    ' Карта уже существующих логических этапов
    BuildExistingStages wsSvc

    ' Выбор источника
    src = ChooseImportSource()
    If src = srcNone Or gAbortImport Then GoTo CleanExit

    Select Case src
        Case srcLocalSheet
            Set wsSrc = PickSourceSheetLocal()
            If wsSrc Is Nothing Then GoTo CleanExit
            ImportStagesFromSheet wsSrc, wsSvc

        Case srcExternalFiles
            ImportStagesFromFiles wsSvc

        Case srcFolder
            ImportStagesFromFolder wsSvc
    End Select


CleanExit:
    Dbg "Загрузить_Данные: завершение"
    Application.EnableEvents = oldEvents
    Application.Calculation = oldCalc
    Application.DisplayAlerts = oldAlerts
    Application.ScreenUpdating = oldScreen
    Exit Sub

ErrHandler:
    Dbg "Загрузить_Данные: ошибка " & Err.Number & " - " & Err.Description
    MsgBox "Загрузка данных Этап_* прервана." & vbCrLf & _
           "Описание: " & Err.Description, vbCritical, "Ошибка при загрузке"
    Resume CleanExit
End Sub

' ======================= ПРОВЕРКА ПРАВ ДОСТУПА =======================

Private Function UserCanImport() As Boolean
    ' Без активной сессии — никакой загрузки
    If Not modUserSecurity.IsLoggedIn Then
        MsgBox "Нет активной сессии пользователя. Закрой книгу и войди заново.", _
               vbCritical, "Загрузка запрещена"
        UserCanImport = False
        Exit Function
    End If

    ' Любая залогиненная роль может вызывать загрузку,
    ' но фильтрация по файлам делается дальше (CanImportFromWorkbook).
    UserCanImport = True
End Function

' Сотрудник: только файлы, где SEC_EMP_HASH совпадает.
' Руководитель / админ: любые файлы.
' Если в файле нет SEC_EMP_HASH или он пустой — файл открыт для всех.
Private Function CanImportFromWorkbook(ByVal wb As Workbook) As Boolean
    Dim remoteHash As String
    Dim localHash As String

    ' Админ — полный доступ
    If modUserSecurity.IsAdmin Then
        CanImportFromWorkbook = True
        Exit Function
    End If

    ' Руководитель — полный доступ
    If modUserSecurity.CurrentRole = ROLE_MANAGER Then
        CanImportFromWorkbook = True
        Exit Function
    End If

    ' Остался сотрудник
    If modUserSecurity.CurrentRole <> ROLE_EMPLOYEE Then
        CanImportFromWorkbook = False
        Exit Function
    End If

    remoteHash = GetHashFromWorkbook(wb, NAME_EMP_HASH)
    If remoteHash = "" Then
        ' В файле нет личного пароля — любой может загрузить
        CanImportFromWorkbook = True
        Exit Function
    End If

    ' Хэш сотрудника в этой (админской) книге
    localHash = GetHashFromWorkbook(ThisWorkbook, NAME_EMP_HASH)

    If localHash = "" Then
        ' В этой книге ещё нет сохранённого пароля сотрудника —
        ' нет права к защищённым файлам
        CanImportFromWorkbook = False
        Exit Function
    End If

    CanImportFromWorkbook = (StrComp(localHash, remoteHash, vbBinaryCompare) = 0)
End Function

Private Function GetHashFromWorkbook(ByVal wb As Workbook, ByVal nm As String) As String
    Dim nmObj As Name
    Dim v As Variant

    On Error Resume Next
    Set nmObj = wb.names(nm)
    On Error GoTo 0

    If nmObj Is Nothing Then Exit Function

    v = wb.Application.Evaluate(nmObj.refersTo)
    If IsError(v) Then Exit Function
    If IsEmpty(v) Then Exit Function

    GetHashFromWorkbook = CStr(v)
End Function

' ======================= КАРТА СУЩЕСТВУЮЩИХ ЭТАПОВ =======================

Private Sub BuildExistingStages(ByVal wsSvc As Worksheet)
    Dim lo As ListObject
    Dim logical As String
    Dim key As String

    Set gExistingStages = CreateObject("Scripting.Dictionary")

    For Each lo In wsSvc.ListObjects
        If Left$(lo.Name, 5) = "Этап_" Then
            logical = Trim$(CleanStageName(lo.Name))
            If Len(logical) > 0 And Not IsServiceStageName(logical) Then
                key = LCase$(logical)
                If Not gExistingStages.exists(key) Then
                    gExistingStages.Add key, lo
                    Dbg "BuildExistingStages: добавлен этап key=" & key & " lo.Name=" & lo.Name
                Else
                    Set gExistingStages(key) = lo
                    Dbg "BuildExistingStages: перезаписан этап key=" & key & " lo.Name=" & lo.Name
                End If
            End If
        End If
    Next lo

    Dbg "BuildExistingStages: всего логических этапов=" & CStr(gExistingStages.Count)
End Sub

Private Sub SetStageAsKnown(ByVal logical As String, ByVal lo As ListObject)
    Dim key As String

    logical = Trim$(logical)
    If lo Is Nothing Then Exit Sub
    If Len(logical) = 0 Then Exit Sub

    If gExistingStages Is Nothing Then Set gExistingStages = CreateObject("Scripting.Dictionary")

    key = LCase$(logical)

    If Not gExistingStages.exists(key) Then
        gExistingStages.Add key, lo
        Dbg "SetStageAsKnown: добавлен key=" & key & " lo.Name=" & lo.Name
    Else
        Set gExistingStages(key) = lo
        Dbg "SetStageAsKnown: обновлён key=" & key & " lo.Name=" & lo.Name
    End If
End Sub

' ======================= ОЧИСТКА ИМЕНИ (аналог PQ) =======================

Private Function CleanStageName(ByVal s As String) As String
    Dim n As String
    Dim pos As Long
    Dim baseName As String
    Dim suffix As String

    n = Trim$(CStr(s))
    If Len(n) = 0 Then
        CleanStageName = ""
        Exit Function
    End If

    pos = InStrRev(n, "_")
    If pos = 0 Then
        CleanStageName = n
        Exit Function
    End If

    baseName = Left$(n, pos - 1)
    suffix = Mid$(n, pos + 1)

    If Len(suffix) = 0 Then
        CleanStageName = n
        Exit Function
    End If

    If IsNumeric(suffix) Then
        ' Не схлопываем чистые "Этап_1", "Этап_2" в один ключ
        If StrComp(baseName, "Этап", vbTextCompare) = 0 Then
            CleanStageName = n
        Else
            CleanStageName = baseName
        End If
    Else
        CleanStageName = n
    End If
End Function

Private Function IsServiceStageName(ByVal stageName As String) As Boolean
    Dim nm As String
    nm = LCase$(Trim$(stageName))
    Select Case nm
        Case "этап", _
             "этап_уз", _
             "этап_совпадение", _
             "этап_поиск", _
             "этап_объединённые", _
             "этап_объединенные"
            IsServiceStageName = True
        Case Else
            IsServiceStageName = False
    End Select
End Function

' ======================= ВЫБОР ИСТОЧНИКА =======================

Private Function ChooseImportSource() As ImportSource
    Dim msg As String
    Dim s As String
    Dim v As Long

    msg = "Загрузка данных Этап_*" & vbCrLf & vbCrLf & _
          "Введите ЦИФРУ:" & vbCrLf & _
          " 1 — Лист в ЭТОЙ книге (копия '" & SVC_SHEET & "')." & vbCrLf & _
          " 2 — Один или несколько файлов Excel (*.xlsm)." & vbCrLf & _
          " 3 — Папка с файлами Excel (*.xlsm)." & vbCrLf & vbCrLf & _
          "Отмена или пустой ввод — выйти без загрузки."

RetryInput:
    s = InputBox(msg, "Источник данных Этап_*")

    If Len(s) = 0 Then
        Dbg "ChooseImportSource: Cancel/пусто -> srcNone"
        ChooseImportSource = srcNone
        Exit Function
    End If

    If Not IsNumeric(s) Then
        MsgBox "Введите 1, 2 или 3, либо нажмите Отмена.", vbExclamation
        GoTo RetryInput
    End If

    v = CLng(s)

    Select Case v
        Case 1
            ChooseImportSource = srcLocalSheet
        Case 2
            ChooseImportSource = srcExternalFiles
        Case 3
            ChooseImportSource = srcFolder
        Case Else
            MsgBox "Введите 1, 2 или 3.", vbExclamation
            GoTo RetryInput
    End Select

    Dbg "ChooseImportSource: выбран " & CStr(ChooseImportSource)
End Function

' ======================= ВАРИАНТ: ЛИСТ В ЭТОЙ КНИГЕ =======================

Private Function PickSourceSheetLocal() As Worksheet
    Dim i As Long
    Dim msg As String
    Dim s As String
    Dim idx As Long
    Dim ws As Worksheet
    Dim candidates As Collection

    Set candidates = New Collection

    For Each ws In ThisWorkbook.Worksheets
        If ws.Name <> SVC_SHEET Then
            candidates.Add ws
        End If
    Next ws

    If candidates.Count = 0 Then
        MsgBox "В книге нет других листов, кроме '" & SVC_SHEET & "'.", vbExclamation
        Set PickSourceSheetLocal = Nothing
        Exit Function
    End If

    msg = "Выберите лист-источник в ЭТОЙ книге по номеру:" & vbCrLf & vbCrLf
    For i = 1 To candidates.Count
        msg = msg & i & " — " & candidates(i).Name & vbCrLf
    Next i
    msg = msg & vbCrLf & "Отмена или пусто — выйти."

RetryInput:
    s = InputBox(msg, "Лист-источник (эта книга)")

    If Len(s) = 0 Then
        Dbg "PickSourceSheetLocal: Cancel/пусто"
        Set PickSourceSheetLocal = Nothing
        Exit Function
    End If

    If Not IsNumeric(s) Then
        MsgBox "Введите номер листа или нажмите Отмена.", vbExclamation
        GoTo RetryInput
    End If

    idx = CLng(s)
    If idx < 1 Or idx > candidates.Count Then
        MsgBox "Номер вне диапазона 1.." & candidates.Count, vbExclamation
        GoTo RetryInput
    End If

    Set PickSourceSheetLocal = candidates(idx)
    Dbg "PickSourceSheetLocal: выбран лист " & PickSourceSheetLocal.Name
End Function

Private Sub ImportStagesFromSheet(ByVal wsSrc As Worksheet, ByVal wsDest As Worksheet)
    Dim lo As ListObject
    Dim imported As Long

    Dbg "ImportStagesFromSheet: источник-лист '" & wsSrc.Name & "'"

    For Each lo In wsSrc.ListObjects
        If gAbortImport Then Exit For
        If Left$(lo.Name, 5) = "Этап_" Then
            Dbg "ImportStagesFromSheet: найден lo.Name=" & lo.Name
            ImportOneStage lo, wsDest
            imported = imported + 1
        End If
    Next lo

    Dbg "ImportStagesFromSheet: завершено, imported=" & imported
    If Not gAbortImport Then
        MsgBox "Загрузка с листа '" & wsSrc.Name & "' завершена." & vbCrLf & _
               "Обработано таблиц Этап_*: " & imported, vbInformation
    End If
End Sub

' ======================= ВАРИАНТ: НЕСКОЛЬКО ФАЙЛОВ =======================

Private Sub ImportStagesFromFiles(ByVal wsDest As Worksheet)
    Dim files As Variant
    Dim i As Long
    Dim importedTotal As Long
    Dim filesCount As Long
    Dim filePath As String   ' <<< добавили

    files = Application.GetOpenFilename( _
        FileFilter:="Excel macro-enabled (*.xlsm),*.xlsm", _
        title:="Выбор файлов Excel (*.xlsm)", _
        MultiSelect:=True)

    If VarType(files) = vbBoolean Then
        Dbg "ImportStagesFromFiles: Cancel"
        Exit Sub
    End If

    For i = LBound(files) To UBound(files)
        If gAbortImport Then Exit For

        filePath = CStr(files(i))

        ' --- ВАЖНО: не трогаем текущую (админскую) книгу ---
        If StrComp(filePath, ThisWorkbook.fullName, vbTextCompare) = 0 Then
            Dbg "ImportStagesFromFiles: пропускаю текущую книгу '" & filePath & "'"
            GoTo NextFile
        End If

        filesCount = filesCount + 1
        Dbg "ImportStagesFromFiles: файл " & filePath
        ImportStagesFromSingleFile filePath, wsDest, importedTotal

NextFile:
    Next i

    If gAbortImport Then
        Dbg "ImportStagesFromFiles: прервано пользователем, filesCount=" & filesCount & " total=" & importedTotal
        Exit Sub
    End If

    Dbg "ImportStagesFromFiles: завершено, filesCount=" & filesCount & " total=" & importedTotal
    MsgBox "Загрузка из файлов завершена." & vbCrLf & _
           "Файлов обработано: " & filesCount & vbCrLf & _
           "Всего таблиц Этап_* обработано: " & importedTotal, _
           vbInformation, "Загрузка завершена"
End Sub


' ======================= ВАРИАНТ: ПАПКА С ФАЙЛАМИ =======================

Private Sub ImportStagesFromFolder(ByVal wsDest As Worksheet)
    Dim fd As Object
    Dim folder As String
    Dim mask As String
    Dim fileName As String
    Dim importedTotal As Long
    Dim filesCount As Long
    Dim basePath As String
    Dim filePath As String   ' <<< добавили

    Set fd = Application.FileDialog(4) ' msoFileDialogFolderPicker

    With fd
        .title = "Выберите папку с файлами Excel (*.xlsm)"
        .AllowMultiSelect = False
        If .Show <> -1 Then
            Dbg "ImportStagesFromFolder: Cancel"
            Exit Sub
        End If
        folder = .SelectedItems(1)
    End With

    If Len(folder) = 0 Then Exit Sub

    If Right$(folder, 1) = Application.PathSeparator Then
        basePath = folder
    Else
        basePath = folder & Application.PathSeparator
    End If

    mask = basePath & "*.xlsm"
    fileName = Dir$(mask)

    Do While Len(fileName) > 0
        If gAbortImport Then Exit Do

        filePath = basePath & fileName

        ' --- ВАЖНО: пропускаем текущую (админскую) книгу ---
        If StrComp(filePath, ThisWorkbook.fullName, vbTextCompare) = 0 Then
            Dbg "ImportStagesFromFolder: пропускаю текущую книгу '" & filePath & "'"
            GoTo NextFileInFolder
        End If

        filesCount = filesCount + 1
        Dbg "ImportStagesFromFolder: файл " & filePath
        ImportStagesFromSingleFile filePath, wsDest, importedTotal

NextFileInFolder:
        fileName = Dir$
    Loop

    If gAbortImport Then
        Dbg "ImportStagesFromFolder: прервано пользователем, filesCount=" & filesCount & " total=" & importedTotal
        Exit Sub
    End If

    If filesCount = 0 Then
        MsgBox "В выбранной папке нет файлов *.xlsm.", vbInformation, "Загрузка из папки"
        Exit Sub
    End If

    Dbg "ImportStagesFromFolder: завершено, filesCount=" & filesCount & " total=" & importedTotal
    MsgBox "Загрузка из папки завершена." & vbCrLf & _
           "Файлов обработано: " & filesCount & vbCrLf & _
           "Всего таблиц Этап_* обработано: " & importedTotal, _
           vbInformation, "Загрузка завершена"
End Sub


' ======================= ОБРАБОТКА ОДНОГО ФАЙЛА =======================

Private Sub ImportStagesFromSingleFile(ByVal filePath As String, ByVal wsDest As Worksheet, _
                                       ByRef importedTotal As Long)
    Dim wb As Workbook
    Dim wsSrc As Worksheet
    Dim imported As Long
    Dim lo As ListObject
    Dim isHost As Boolean   ' <<< добавили

    Dbg "ImportStagesFromSingleFile: открываю '" & filePath & "'"

    ' Жёсткая фильтрация по расширению
    If LCase$(Right$(filePath, 5)) <> ".xlsm" Then
        Dbg "ImportStagesFromSingleFile: пропуск (не .xlsm) '" & filePath & "'"
        Exit Sub
    End If

    ' На всякий случай ещё раз отсекаем текущую книгу по пути
    If StrComp(filePath, ThisWorkbook.fullName, vbTextCompare) = 0 Then
        Dbg "ImportStagesFromSingleFile: это текущая книга, пропуск '" & filePath & "'"
        Exit Sub
    End If

    On Error Resume Next
    Set wb = Application.Workbooks.Open(fileName:=filePath, ReadOnly:=True)
    On Error GoTo 0

    If wb Is Nothing Then
        Dbg "ImportStagesFromSingleFile: не удалось открыть файл"
        MsgBox "Не удалось открыть файл: " & filePath, vbExclamation, "Ошибка открытия файла"
        Exit Sub
    End If

    ' Дополнительная защита: вдруг Excel вернул ссылку на ThisWorkbook
    isHost = (wb Is ThisWorkbook)
    If isHost Then
        Dbg "ImportStagesFromSingleFile: Excel вернул ThisWorkbook, закрывать и обрабатывать нельзя"
        Exit Sub
    End If

    ' Только лист Служебный_лист, без альтернатив
    On Error Resume Next
    Set wsSrc = wb.Worksheets(SVC_SHEET)
    On Error GoTo 0

    If wsSrc Is Nothing Then
        Dbg "ImportStagesFromSingleFile: нет листа '" & SVC_SHEET & "' — пропуск файла"
        wb.Close SaveChanges:=False
        Exit Sub
    End If

    ' Проверка прав сотрудника на этот файл
    If Not CanImportFromWorkbook(wb) Then
        Dbg "ImportStagesFromSingleFile: нет прав на файл (хэш не совпадает) '" & filePath & "'"
        wb.Close SaveChanges:=False
        Exit Sub
    End If

    Dbg "ImportStagesFromSingleFile: источник-лист '" & wsSrc.Name & "'"

    For Each lo In wsSrc.ListObjects
        If gAbortImport Then Exit For
        If Left$(lo.Name, 5) = "Этап_" Then
            Dbg "ImportStagesFromSingleFile: найден lo.Name=" & lo.Name
            ImportOneStage lo, wsDest
            imported = imported + 1
        End If
    Next lo

    wb.Close SaveChanges:=False
    importedTotal = importedTotal + imported

    Dbg "ImportStagesFromSingleFile: завершено, imported=" & imported
End Sub


' ======================= ИМПОРТ ОДНОЙ ТАБЛИЦЫ ЭТАПА =======================

Private Sub ImportOneStage(ByVal loSrc As ListObject, ByVal wsDest As Worksheet)
    Dim srcName    As String
    Dim headerText As String
    Dim logical    As String
    Dim key        As String
    Dim loBase     As ListObject
    Dim loTarget   As ListObject
    Dim action     As DupAction
    Dim newLogical As String
    Dim newKey     As String

    If gAbortImport Then Exit Sub

    srcName = loSrc.Name
    logical = Trim$(CleanStageName(srcName))
    If Len(logical) = 0 Then Exit Sub
    If IsServiceStageName(logical) Then Exit Sub

    key = LCase$(logical)

    headerText = GetStageHeaderText(loSrc)
    If Len(Trim$(headerText)) = 0 Then headerText = logical

    ' Если логического этапа ещё нет — создаём новый
    If gExistingStages Is Nothing Or Not gExistingStages.exists(key) Then
        Dbg "ImportOneStage: НОВЫЙ этап logical=" & logical & " srcName=" & srcName
        Set loTarget = PlaceImportedStage(loSrc, wsDest, headerText, logical)
        SetStageAsKnown logical, loTarget
        Exit Sub
    End If

    ' Дубликат
    Set loBase = gExistingStages(key)
    Dbg "ImportOneStage: ДУБЛИКАТ logical=" & logical & " base=" & loBase.Name & " srcName=" & srcName

    ' Выбор действия
    If gDupGlobalPolicySet Then
        action = gDupGlobalPolicy
        If action = daNew Then
            newLogical = logical & "_" & gDupGlobalNewSuffix
        End If
        Dbg "ImportOneStage: ГЛОБАЛЬНАЯ политика action=" & CStr(action) & _
            IIf(action = daNew, " newLogical=" & newLogical, "") & " для logical=" & logical
    Else
        If gDupPolicy Is Nothing Then Set gDupPolicy = CreateObject("Scripting.Dictionary")
        If gDupNewName Is Nothing Then Set gDupNewName = CreateObject("Scripting.Dictionary")

        If gDupPolicy.exists(key) Then
            action = gDupPolicy(key)
            If action = daNew Then
                If gDupNewName.exists(key) Then
                    newLogical = gDupNewName(key)
                End If
            End If
            Dbg "ImportOneStage: используем сохранённую политику action=" & CStr(action) & _
                IIf(action = daNew, " newLogical=" & newLogical, "") & " для logical=" & logical
        Else
            action = AskDuplicateAction(logical, srcName, newLogical)
            Dbg "ImportOneStage: AskDuplicateAction вернул action=" & CStr(action) & _
                IIf(action = daNew, " newLogical=" & newLogical, "") & " для logical=" & logical
        End If
    End If

    If gAbortImport Then
        Dbg "ImportOneStage: gAbortImport=True после AskDuplicateAction, выхожу"
        Exit Sub
    End If

    Select Case action
        Case daSkip
            Dbg "ImportOneStage: Skip для logical=" & logical

        Case daMerge
            Dbg "ImportOneStage: Merge в " & loBase.Name & " для logical=" & logical
            AppendStageData loSrc, loBase

        Case daNew
            If Len(Trim$(newLogical)) = 0 Then
                ' На всякий случай
                newLogical = logical & "_" & gDupSuffixDefault
            End If

            newLogical = Trim$(newLogical)
            newKey = LCase$(CleanStageName(newLogical))

            ' Пытаемся найти уже созданный целевой этап
            If gExistingStages.exists(newKey) Then
                Set loTarget = gExistingStages(newKey)
                Dbg "ImportOneStage: daNew -> MERGE в существующий этап " & loTarget.Name & _
                    " для logical=" & logical & " newLogical=" & newLogical
                AppendStageData loSrc, loTarget
            Else
                Dbg "ImportOneStage: daNew -> создаём новый этап newLogical=" & newLogical & _
                    " для logical=" & logical
                Set loTarget = PlaceImportedStage(loSrc, wsDest, newLogical, newLogical)
                SetStageAsKnown newLogical, loTarget
            End If
    End Select
End Sub

' ======================= ДИАЛОГ ПО ДУБЛИКАТУ =======================

Private Function AskDuplicateAction(ByVal logical As String, _
                                   ByVal srcName As String, _
                                   ByRef outNewLogical As String) As DupAction
    Dim key As String
    Dim s As String
    Dim v As Long
    Dim msg As String
    Dim suffix As String
    Dim applyAll As VbMsgBoxResult

    key = LCase$(logical)
    outNewLogical = ""

RetryInput:
    msg = "Этап """ & logical & """ уже существует на листе '" & SVC_SHEET & "'." & vbCrLf & _
          "(Имя таблицы в файле-источнике: " & srcName & ")" & vbCrLf & vbCrLf & _
          "Введите ЦИФРУ:" & vbCrLf & _
          " 0 — ПРОПУСТИТЬ только этот экземпляр." & vbCrLf & _
          " 1 — ОБЪЕДИНИТЬ данные (добавить строки в существующую таблицу)." & vbCrLf & _
          " 2 — СОЗДАТЬ НОВЫЙ ЭТАП с дополнительным окончанием (логическое имя + ""_суффикс"")." & vbCrLf & vbCrLf & _
          "Отмена или пустой ввод — ПРЕРВАТЬ ВСЮ ЗАГРУЗКУ."

    s = InputBox(msg, "Конфликт этапа """ & logical & """")

    ' Cancel / пусто > прервать всю загрузку
    If Len(s) = 0 Then
        Dbg "AskDuplicateAction: Cancel/пусто -> gAbortImport=True для logical=" & logical
        gAbortImport = True
        AskDuplicateAction = daSkip
        Exit Function
    End If

    If Not IsNumeric(s) Then
        MsgBox "Введите номер от 0 до 2, либо нажмите Отмена.", vbExclamation
        GoTo RetryInput
    End If

    v = CLng(s)
    If v < 0 Or v > 2 Then
        MsgBox "Число должно быть от 0 до 2.", vbExclamation
        GoTo RetryInput
    End If

    Select Case v
        Case 0  ' Skip
            AskDuplicateAction = daSkip
            Dbg "AskDuplicateAction: выбор пользователя = Skip для logical=" & logical

            applyAll = MsgBox( _
                "Применять ПРОПУСК ко всем последующим конфликтам (любой этап)?", _
                vbQuestion + vbYesNo, "Применить для всех?")

            If applyAll = vbYes Then
                gDupGlobalPolicySet = True
                gDupGlobalPolicy = daSkip
                gDupGlobalNewSuffix = ""
                Dbg "AskDuplicateAction: Skip + applyAll=Yes (ГЛОБАЛЬНО)"
            End If

            Exit Function

        Case 1  ' Merge
            AskDuplicateAction = daMerge
            Dbg "AskDuplicateAction: выбор пользователя = Merge (только этот) для logical=" & logical

            applyAll = MsgBox( _
                "Применять ОБЪЕДИНЕНИЕ ко всем последующим конфликтам (любые этапы)?", _
                vbQuestion + vbYesNo, "Применить для всех?")

            If applyAll = vbYes Then
                If gDupPolicy Is Nothing Then Set gDupPolicy = CreateObject("Scripting.Dictionary")
                gDupPolicy(key) = daMerge

                gDupGlobalPolicySet = True
                gDupGlobalPolicy = daMerge
                gDupGlobalNewSuffix = ""
                Dbg "AskDuplicateAction: Merge + applyAll=Yes (ГЛОБАЛЬНО) для logical=" & logical
            End If

            Exit Function

        Case 2  ' New
            suffix = InputBox( _
                prompt:="Введите окончание, которое будет ДОБАВЛЕНО к логическому имени этапа." & vbCrLf & _
                        "Будет использовано имя вида:" & vbCrLf & _
                        "  " & logical & "_<ваш_суффикс>" & vbCrLf & vbCrLf & _
                        "Например:" & vbCrLf & _
                        "  суффикс = проба  > " & logical & "_проба", _
                title:="Новый этап по дубликату """ & logical & """", _
                Default:=gDupSuffixDefault)

            suffix = Trim$(suffix)
            If Len(suffix) = 0 Then
                Dbg "AskDuplicateAction: пустой суффикс -> daSkip для logical=" & logical
                AskDuplicateAction = daSkip
                Exit Function
            End If

            gDupSuffixDefault = suffix
            outNewLogical = logical & "_" & suffix
            AskDuplicateAction = daNew

            applyAll = MsgBox( _
                "Применять вариант ""НОВЫЙ ЭТАП с суффиксом '_" & suffix & "'"" ко всем" & vbCrLf & _
                "последующим конфликтам (любые этапы) в рамках текущей загрузки?", _
                vbQuestion + vbYesNo, "Применить для всех?")

            If applyAll = vbYes Then
                If gDupPolicy Is Nothing Then Set gDupPolicy = CreateObject("Scripting.Dictionary")
                If gDupNewName Is Nothing Then Set gDupNewName = CreateObject("Scripting.Dictionary")

                gDupPolicy(key) = daNew
                gDupNewName(key) = outNewLogical

                gDupGlobalPolicySet = True
                gDupGlobalPolicy = daNew
                gDupGlobalNewSuffix = suffix

                Dbg "AskDuplicateAction: daNew + applyAll=Yes (ГЛОБАЛЬНО) logical=" & logical & _
                    " outNewLogical=" & outNewLogical
            Else
                Dbg "AskDuplicateAction: daNew + applyAll=No logical=" & logical & _
                    " outNewLogical=" & outNewLogical
            End If

            Exit Function
    End Select
End Function

' ======================= ЗАГОЛОВОК ЭТАПА =======================

Private Function GetStageHeaderText(ByVal lo As ListObject) As String
    Dim r As Range
    On Error Resume Next
    Set r = lo.Range
    On Error GoTo 0

    If r Is Nothing Then Exit Function
    If r.Row <= 1 Then Exit Function

    GetStageHeaderText = CStr(lo.Parent.Cells(r.Row - 1, r.Column).value)
End Function

' ======================= РАЗМЕЩЕНИЕ НОВОЙ ТАБЛИЦЫ =======================

Private Function PlaceImportedStage(ByVal loSrc As ListObject, ByVal wsDest As Worksheet, _
                                    ByVal stageHeader As String, ByVal stageName As String) As ListObject
    Dim headerRow As Long
    Dim anchorHdr As Range
    Dim src As Range, destTopLeft As Range, dest As Range
    Dim k As Long
    Dim loNew As ListObject

    Dbg "PlaceImportedStage: stageName=" & stageName & " header=" & stageHeader

    ' Заголовок
    Set anchorHdr = NextStageHeaderAnchor_Import(wsDest, headerRow)
    anchorHdr.value = stageHeader

    ' Named Range для заголовка
    On Error Resume Next
    ThisWorkbook.names("Заголовок_" & stageName).Delete
    On Error GoTo 0

    ThisWorkbook.names.Add Name:="Заголовок_" & stageName, _
        refersTo:="='" & wsDest.Name & "'!" & anchorHdr.Address(False, False)

    ' Исходный диапазон таблицы
    Set src = loSrc.Range

    ' Точка вставки под заголовком
    Set destTopLeft = wsDest.Cells(anchorHdr.Row + 1, anchorHdr.Column)
    Set destTopLeft = EnsureRoomRightAnchor_Import(wsDest, destTopLeft, src.rows.Count, src.Columns.Count, stageName)

    Set dest = wsDest.Range(destTopLeft, destTopLeft.Offset(src.rows.Count - 1, src.Columns.Count - 1))

    ' 1) Значения
    dest.value = src.value

    ' 2) Форматы / валидация
    If COPY_FORMATS Or COPY_VALIDATION Then
        src.Copy
        If COPY_FORMATS Then
            dest.PasteSpecial xlPasteFormats
        End If
        If COPY_VALIDATION Then
            On Error Resume Next
            dest.PasteSpecial xlPasteValidation
            On Error GoTo 0
        End If
        Application.CutCopyMode = False
    End If

    ' 3) Ширина столбцов
    For k = 1 To src.Columns.Count
        dest.Columns(k).ColumnWidth = src.Columns(k).ColumnWidth
    Next k

    ' 4) Новый ListObject
    Set loNew = wsDest.ListObjects.Add(xlSrcRange, dest, , xlYes)
    On Error Resume Next
    loNew.Name = stageName
    On Error GoTo 0

    Dbg "PlaceImportedStage: создан loNew.Name=" & loNew.Name

    Set PlaceImportedStage = loNew
End Function

' ======================= ОБЪЕДИНЕНИЕ ДАННЫХ =======================

Private Sub AppendStageData(ByVal loSrc As ListObject, ByVal loDest As ListObject)
    Dim srcData As Range
    Dim srcCols As Long, destCols As Long
    Dim r As Range
    Dim newRow As ListRow
    Dim added As Long

    If loSrc.DataBodyRange Is Nothing Then Exit Sub
    Set srcData = loSrc.DataBodyRange

    srcCols = srcData.Columns.Count
    If loDest.DataBodyRange Is Nothing Then
        destCols = loDest.HeaderRowRange.Columns.Count
    Else
        destCols = loDest.DataBodyRange.Columns.Count
    End If

    If srcCols <> destCols Then
        MsgBox "Нельзя объединить таблицы '" & loSrc.Name & "' и '" & loDest.Name & "':" & vbCrLf & _
               "разное количество столбцов.", vbExclamation
        Exit Sub
    End If

    For Each r In srcData.rows
        Set newRow = loDest.ListRows.Add
        newRow.Range.value = r.value
        added = added + 1
    Next r

    Dbg "AppendStageData: from " & loSrc.Name & " to " & loDest.Name & " добавлено строк=" & added
End Sub

' ======================= ПОИСК МЕСТА СПРАВА =======================

Private Function NextStageHeaderAnchor_Import(ByVal ws As Worksheet, ByRef headerRow As Long) As Range
    Dim rightmostCol As Long: rightmostCol = 0
    Dim minHeaderRow As Long: minHeaderRow = 0

    Dim lo As ListObject
    Dim rc As Long
    Dim rHdr As Range
    Dim thisHdrRow As Long
    Dim shp As Shape

    ' --- 1) Этап_*: правый край и строка заголовков ---
    For Each lo In ws.ListObjects
        If StrComp(Left$(lo.Name, 5), "Этап_", vbTextCompare) = 0 Then
            rc = lo.Range.Column + lo.Range.Columns.Count - 1
            If rc > rightmostCol Then rightmostCol = rc

            thisHdrRow = 0
            On Error Resume Next
            Set rHdr = ThisWorkbook.names("Заголовок_" & lo.Name).RefersToRange
            On Error GoTo 0

            If Not rHdr Is Nothing Then
                thisHdrRow = rHdr.Row
            Else
                thisHdrRow = Application.Max(1, lo.Range.Row - 1)
            End If

            If minHeaderRow = 0 Or thisHdrRow < minHeaderRow Then
                minHeaderRow = thisHdrRow
            End If
        End If
    Next lo

    ' --- 2) Любые фигуры (диаграммы, срезы, картинки) ---
    ' Берём максимальный столбец по нижнему правому углу фигуры
    On Error Resume Next
    For Each shp In ws.Shapes
        rc = 0
        rc = shp.BottomRightCell.Column
        If rc > rightmostCol Then rightmostCol = rc
    Next shp
    On Error GoTo 0

    ' --- 3) Итоговая точка для заголовка нового Этап_* ---
    If rightmostCol = 0 Then
        ' Нет ни Этапов, ни фигур
        headerRow = 1
        Set NextStageHeaderAnchor_Import = ws.Cells(1, 1)
    Else
        If minHeaderRow <= 0 Then minHeaderRow = 1
        headerRow = minHeaderRow
        ' Через один столбец справа от самого правого объекта
        Set NextStageHeaderAnchor_Import = ws.Cells(headerRow, rightmostCol + 2)
    End If
End Function


Private Function EnsureRoomRightAnchor_Import(ByVal ws As Worksheet, ByVal anchor As Range, _
                                              ByVal needRows As Long, ByVal needCols As Long, _
                                              ByVal tag As String) As Range
    Dim cur As Range: Set cur = anchor
    Dim tries As Long: tries = 0
    Dim dest As Range
    Dim hit As Boolean
    Dim lo As ListObject

    Do
        tries = tries + 1
        If tries > 500 Then Err.Raise 1004, , "Не удалось подготовить место под '" & tag & "'."
        If cur.MergeCells Then Set cur = cur.MergeArea.Cells(1, 1)

        If IsInsideAnyListObject_Import(cur) Then
            ws.Columns(cur.Column).Insert
            Set cur = ws.Cells(cur.Row, cur.Column)
            GoTo CONT
        End If

        Set dest = ws.Range(cur, cur.Offset(needRows - 1, needCols - 1))
        hit = False

        For Each lo In ws.ListObjects
            If Not Application.Intersect(dest, lo.Range) Is Nothing Then
                ws.Columns(dest.Columns(dest.Columns.Count).Column + 1).Insert
                Set cur = ws.Cells(cur.Row, cur.Column)
                hit = True
                Exit For
            End If
        Next lo

        If Not hit Then Exit Do
CONT:
    Loop

    Set EnsureRoomRightAnchor_Import = cur
End Function

Private Function IsInsideAnyListObject_Import(ByVal cell As Range) As Boolean
    Dim lo As ListObject
    For Each lo In cell.Worksheet.ListObjects
        If Not Application.Intersect(cell, lo.Range) Is Nothing Then
            IsInsideAnyListObject_Import = True
            Exit Function
        End If
        If Not Application.Intersect(cell, lo.HeaderRowRange) Is Nothing Then
            IsInsideAnyListObject_Import = True
            Exit Function
        End If
    Next lo
End Function


