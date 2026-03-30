Attribute VB_Name = "modAdminImport"
'=== modUserSecurity ===
Option Explicit

' --- Роли ---
Public CurrentRole As Long        ' 0 = нет, 1 = сотрудник, 2 = руководитель
Public IsAdmin As Boolean         ' True, если зашли через админ-код (098)
Public IsLoggedIn As Boolean      ' True, если вход прошёл успешно

Private Const ROLE_EMPLOYEE As Long = 1
Private Const ROLE_MANAGER  As Long = 2

' --- Где храним хэши паролей ролей ---
Private Const NAME_EMP_HASH As String = "SEC_EMP_HASH"
Private Const NAME_MNG_HASH As String = "SEC_MNG_HASH"

' --- Секретный код администратора ---
Private Const ADMIN_CODE As String = "098"

' --- Количество попыток ввода ---
Private Const MAX_LOGIN_TRIES As Long = 3

' =========================================================
'  ВХОД ПРИ ОТКРЫТИИ КНИГИ
'  Вызывается из ThisWorkbook.Workbook_Open.
'  Возвращает True, если доступ разрешён; False — если книгу надо закрыть.
' =========================================================
Public Function LoginOnOpen() As Boolean
    Dim sel As String
    Dim tries As Long

    IsLoggedIn = False
    IsAdmin = False
    CurrentRole = 0

    ' --- Шаг 1. Выбор режима / ввод админ-кода ---
    For tries = 1 To MAX_LOGIN_TRIES
        sel = InputBox( _
            "Доступ к книге:" & vbCrLf & vbCrLf & _
            "  1 — Сотрудник" & vbCrLf & _
            "  2 — Руководитель" & vbCrLf & vbCrLf & _
            "Либо введите секретный код администратора.", _
            "Выбор роли / код доступа")

        ' Отмена или пустая строка > нет доступа
        If sel = "" Then
            LoginOnOpen = False
            Exit Function
        End If

        sel = Trim(sel)

        ' Секретный админ-код
        If sel = ADMIN_CODE Then
            IsAdmin = True
            IsLoggedIn = True
            CurrentRole = ROLE_MANAGER   ' Админ логически «над» руководителем
            LoginOnOpen = True
            Exit Function
        End If

        ' Обычные режимы 1 / 2
        If sel = "1" Or sel = "2" Then
            If sel = "1" Then
                CurrentRole = ROLE_EMPLOYEE
            Else
                CurrentRole = ROLE_MANAGER
            End If
            Exit For
        End If

        MsgBox "Введите 1, 2 или секретный код администратора.", _
               vbExclamation, "Неверный ввод"
    Next tries

    ' Не выбрали валидный режим за 3 попытки
    If CurrentRole = 0 Then
        LoginOnOpen = False
        Exit Function
    End If

    ' --- Шаг 2. Личный пароль для роли (если не админ) ---
    If AuthenticateRole(CurrentRole) Then
        IsLoggedIn = True
        LoginOnOpen = True
    Else
        LoginOnOpen = False
    End If
End Function

' =========================================================
'  Смена пароля текущей роли (по кнопке)
' =========================================================
Public Sub ChangeMyPassword()
    If Not IsLoggedIn Then
        MsgBox "Сначала нужно войти в книгу.", vbExclamation, "Смена пароля"
        Exit Sub
    End If

    If CurrentRole <> ROLE_EMPLOYEE And CurrentRole <> ROLE_MANAGER Then
        MsgBox "Роль не определена. Перезапусти книгу.", vbExclamation, "Смена пароля"
        Exit Sub
    End If

    ' Если очень хочется — можно добавить подтверждение старого пароля.
    ' Но раз пользователь уже залогинен, он его знает.

    If SetupNewPassword(CurrentRole, True) Then
        MsgBox "Пароль изменён.", vbInformation, "Смена пароля"
    Else
        MsgBox "Пароль не изменён.", vbInformation, "Смена пароля"
    End If
End Sub

' =========================================================
'  ВНУТРЕННЯЯ ЛОГИКА
' =========================================================

' ---- Аутентификация роли по личному паролю ----
' role = 1 (сотрудник) или 2 (руководитель)
Private Function AuthenticateRole(ByVal role As Long) As Boolean
    Dim hashName As String
    Dim storedHash As String
    Dim title As String
    Dim i As Long
    Dim pw As String

    ' Если зашли как админ через ADMIN_CODE — сюда не попадём
    If IsAdmin Then
        AuthenticateRole = True
        Exit Function
    End If

    hashName = GetHashNameForRole(role)
    If hashName = "" Then
        AuthenticateRole = False
        Exit Function
    End If

    storedHash = ReadStoredHash(hashName)

    If role = ROLE_EMPLOYEE Then
        title = "Вход: Сотрудник"
    Else
        title = "Вход: Руководитель"
    End If

    ' Пароль ещё не задан > создаём
    If storedHash = "" Then
        If SetupNewPassword(role, False) Then
            AuthenticateRole = True
        Else
            AuthenticateRole = False
        End If
        Exit Function
    End If

    ' Пароль есть > спрашиваем до 3 раз
    For i = 1 To MAX_LOGIN_TRIES
        pw = InputBox( _
            "Введите личный пароль." & vbCrLf & _
            "Попытка " & CStr(i) & " из " & CStr(MAX_LOGIN_TRIES) & ".", _
            title)

        ' Отмена или пусто > отказ
        If pw = "" Then
            AuthenticateRole = False
            Exit Function
        End If

        If MakeHash(pw) = storedHash Then
            AuthenticateRole = True
            Exit Function
        End If
    Next i

    MsgBox "Пароль введён неверно " & CStr(MAX_LOGIN_TRIES) & " раз." & vbCrLf & _
           "Обратись к администратору для сброса пароля.", _
           vbExclamation, "Доступ запрещён"

    AuthenticateRole = False
End Function

' ---- Установка / смена пароля для роли ----
' isChange = False > первый раз, True > смена
Private Function SetupNewPassword(ByVal role As Long, ByVal isChange As Boolean) As Boolean
    Dim title As String
    Dim msg As String
    Dim pw1 As String, pw2 As String
    Dim hashName As String

    If role = ROLE_EMPLOYEE Then
        title = IIf(isChange, "Смена пароля (Сотрудник)", "Новый пароль (Сотрудник)")
    Else
        title = IIf(isChange, "Смена пароля (Руководитель)", "Новый пароль (Руководитель)")
    End If

    msg = "Задай личный пароль для своей роли." & vbCrLf & _
          "Пароль хранится только в этой книге, в зашифрованном виде." & vbCrLf & _
          "Не используй здесь пароли от других систем."

RetryNew:
    pw1 = InputBox(msg & vbCrLf & vbCrLf & "Введите новый пароль:", title)
    If pw1 = "" Then
        SetupNewPassword = False
        Exit Function
    End If

    pw2 = InputBox("Повторите новый пароль:", title)
    If pw2 = "" Then
        SetupNewPassword = False
        Exit Function
    End If

    If pw1 <> pw2 Then
        MsgBox "Пароли не совпадают. Попробуй ещё раз.", vbExclamation, title
        GoTo RetryNew
    End If

    hashName = GetHashNameForRole(role)
    If hashName = "" Then
        SetupNewPassword = False
        Exit Function
    End If

    WriteStoredHash hashName, MakeHash(pw1)
    SetupNewPassword = True
End Function

' ---- Имя Name для роли ----
Private Function GetHashNameForRole(ByVal role As Long) As String
    Select Case role
        Case ROLE_EMPLOYEE
            GetHashNameForRole = NAME_EMP_HASH
        Case ROLE_MANAGER
            GetHashNameForRole = NAME_MNG_HASH
        Case Else
            GetHashNameForRole = ""
    End Select
End Function

' ---- Чтение зашифрованного пароля из Name книги ----
Private Function ReadStoredHash(ByVal hashName As String) As String
    Dim nm As Name
    Dim s As String

    On Error Resume Next
    Set nm = ThisWorkbook.names(hashName)
    On Error GoTo 0

    If nm Is Nothing Then
        ReadStoredHash = ""
        Exit Function
    End If

    ' Обычно RefersTo = ="ABCD..."
    s = CStr(nm.refersTo)

    If Len(s) >= 3 And Left$(s, 2) = "=""" And Right$(s, 1) = """" Then
        ReadStoredHash = Mid$(s, 3, Len(s) - 3)
    Else
        ReadStoredHash = s
    End If
End Function

' ---- Запись зашифрованного пароля в Name книги ----
Private Sub WriteStoredHash(ByVal hashName As String, ByVal hashValue As String)
    On Error Resume Next
    ThisWorkbook.names(hashName).Delete
    On Error GoTo 0

    ThisWorkbook.names.Add Name:=hashName, refersTo:="=""" & hashValue & """"
End Sub

' ---- Простейшая обфускация пароля ----
Private Function MakeHash(ByVal pw As String) As String
    Dim i As Long
    Dim ch As Integer
    Dim s As String

    For i = 1 To Len(pw)
        ch = Asc(Mid$(pw, i, 1)) Xor 137
        s = s & Right$("0" & Hex$(ch), 2)
    Next i

    MakeHash = s
End Function


