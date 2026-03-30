Attribute VB_Name = "modUserSecurity"
'=== modUserSecurity ===
Option Explicit

' ----------------- НАСТРОЙКИ / РУБИЛЬНИК -----------------

' Глобальный рубильник системы личных паролей.
' Если False — КНИГА ОТКРЫВАЕТСЯ БЕЗ ЛЮБЫХ ПАРОЛЕЙ,
' текущая роль = Админ, вся защита только паролем на VBA-проект.
Public Const USER_SECURITY_ENABLED As Boolean = True

' Разрешить использование процедуры Admin_ResetAllPasswords.
' Если False — процедура будет ругаться и ничего не трогать.
Public Const ALLOW_PASSWORD_RESET As Boolean = True


' ----------------- РОЛИ И КОДЫ -----------------

Public Enum UserRoleLevel
    ROLE_NONE = 0
    ROLE_EMPLOYEE = 1   ' Сотрудник
    ROLE_MANAGER = 2    ' Руководитель
    ROLE_ADMIN = 3      ' Админ (скрытый код 098)
End Enum

' Текущая роль после входа
Public gCurrentRole As UserRoleLevel

' Скрытый мастер-код админа
Private Const ADMIN_MASTER_CODE As String = "098"

' Имёна скрытых констант с хешами паролей
Private Const NAME_EMP_HASH As String = "SEC_EMP_HASH"
Private Const NAME_MGR_HASH As String = "SEC_MGR_HASH"



' ------------------------ ТОЧКА ВХОДА ------------------------

' Вызывается из ThisWorkbook.Workbook_Open.
' Возвращает True, если доступ разрешён; False — если книгу надо закрыть.
Public Function LoginOnOpen() As Boolean
    Dim ans As String
    Dim role As UserRoleLevel

    ' РУБИЛЬНИК: если защита выключена — сразу админ, без вопросов
    If Not USER_SECURITY_ENABLED Then
        gCurrentRole = ROLE_ADMIN
        LoginOnOpen = True
        Exit Function
    End If

RoleMenu:
    gCurrentRole = ROLE_NONE

    ans = InputBox( _
        "Выберите режим или введите код доступа:" & vbCrLf & vbCrLf & _
        "1 — Сотрудник" & vbCrLf & _
        "2 — Руководитель", _
        "Вход в книгу")

    ans = Trim$(ans)

    ' Пусто / Cancel => закрываем книгу
    If ans = "" Then
        LoginOnOpen = False
        Exit Function
    End If

    ' Скрытый уровень: админ по мастер-коду
    If ans = ADMIN_MASTER_CODE Then
        gCurrentRole = ROLE_ADMIN
        LoginOnOpen = True
        Exit Function
    End If

    Select Case ans
        Case "1"
            role = ROLE_EMPLOYEE
            If AuthRole(role) Then
                gCurrentRole = role
                LoginOnOpen = True
                Exit Function
            Else
                ' Cancel или неудачный вход -> вернуться к выбору роли
                GoTo RoleMenu
            End If

        Case "2"
            role = ROLE_MANAGER
            If AuthRole(role) Then
                gCurrentRole = role
                LoginOnOpen = True
                Exit Function
            Else
                GoTo RoleMenu
            End If

        Case Else
            MsgBox "Введите ""1"", ""2"" или админ-код.", _
                   vbExclamation, "Неверный ввод"
            GoTo RoleMenu
    End Select
End Function


' ------------------------ АВТОРИЗАЦИЯ РОЛИ ------------------------

' Возвращает True, если пароль введён верно.
' Cancel при ЛЮБОМ вводе пароля => False (возврат к меню ролей).
' На втором экране:
'   - вводишь обычный пароль > вход
'   - вводишь 0 > смена пароля для этой роли
Private Function AuthRole(ByVal role As UserRoleLevel) As Boolean
    Dim hashName As String
    Dim roleCaption As String
    Dim curHash As String

    Select Case role
        Case ROLE_EMPLOYEE
            hashName = NAME_EMP_HASH
            roleCaption = "Сотрудник"
        Case ROLE_MANAGER
            hashName = NAME_MGR_HASH
            roleCaption = "Руководитель"
        Case Else
            AuthRole = False
            Exit Function
    End Select

    curHash = GetNameValue(hashName)

    ' --- Пароль ещё не задан: создаём и считаем, что пользователь вошёл ---
    If curHash = "" Then
        If CreateRolePassword(hashName, roleCaption) Then
            AuthRole = True
        Else
            AuthRole = False
        End If
        Exit Function
    End If

    ' --- Пароль задан: просим ввести, попыток бесконечное количество ---
    Dim failCount As Long
    Dim warnShown As Boolean
    Dim pw As String

    Do
        pw = InputBox( _
            "Введите личный пароль для роли: " & roleCaption & vbCrLf & _
            "(или введите 0, чтобы ИЗМЕНИТЬ пароль)", _
            "Вход — " & roleCaption)

        ' Cancel / пусто => возврат к меню ролей
        If pw = "" Then
            AuthRole = False
            Exit Function
        End If

        ' 0 => смена пароля для этой роли
        If pw = "0" Then
            If ChangePasswordForRole(hashName, roleCaption) Then
                ' Пароль успешно сменён > считаем, что пользователь вошёл
                AuthRole = True
                Exit Function
            Else
                ' Отмена/ошибки при смене > снова показываем ввод пароля
                ' без увеличения счётчика ошибок
            End If
        Else
            ' Обычная проверка пароля
            If MakeHash(pw) = curHash Then
                AuthRole = True
                Exit Function
            Else
                failCount = failCount + 1
                MsgBox "Неверный пароль.", vbExclamation, "Ошибка"

                ' После 3-й ошибки — один раз подсказка про администратора
                If failCount >= 3 And Not warnShown Then
                    MsgBox "Если вы забыли пароль, обратитесь к администратору " & _
                           "для его сброса или изменения.", _
                           vbInformation, "Пароль не принят"
                    warnShown = True
                End If
            End If
        End If
    Loop
End Function


' ------------------------ СОЗДАНИЕ ПАРОЛЯ ДЛЯ РОЛИ ------------------------

Private Function CreateRolePassword(ByVal hashName As String, _
                                    ByVal roleCaption As String) As Boolean
    Dim p1 As String, p2 As String

CreateAgain:
    p1 = InputBox( _
        "Задайте ЛИЧНЫЙ пароль для роли: " & roleCaption & vbCrLf & _
        "Пароль относится только к этой книге.", _
        "Создание пароля — " & roleCaption)

    ' Cancel / пусто => выход к меню ролей
    If p1 = "" Then
        CreateRolePassword = False
        Exit Function
    End If

    p2 = InputBox( _
        "Повторите пароль для роли: " & roleCaption, _
        "Подтверждение пароля — " & roleCaption)

    If p2 = "" Then
        CreateRolePassword = False
        Exit Function
    End If

    If p1 <> p2 Then
        MsgBox "Пароли не совпадают. Попробуйте ещё раз.", _
               vbExclamation, "Ошибка"
        GoTo CreateAgain
    End If

    SetNameValue hashName, MakeHash(p1)
    CreateRolePassword = True
End Function


' ------------------------ СМЕНА ПАРОЛЯ ДЛЯ КОНКРЕТНОЙ РОЛИ ------------------------

' Вызывается из AuthRole при вводе "0"
Private Function ChangePasswordForRole(ByVal hashName As String, _
                                       ByVal roleCaption As String) As Boolean
    Dim curHash As String
    curHash = GetNameValue(hashName)

    ' На случай, если зачем-то вызвали при пустом пароле
    If curHash = "" Then
        MsgBox "Для роли """ & roleCaption & """ ещё не задан пароль." & vbCrLf & _
               "Сначала войдите под этой ролью и задайте пароль.", _
               vbInformation, "Нет текущего пароля"
        ChangePasswordForRole = False
        Exit Function
    End If

    Dim failCount As Long
    Dim warnShown As Boolean
    Dim oldPw As String

CheckOld:
    oldPw = InputBox( _
        "Введите ТЕКУЩИЙ пароль для роли: " & roleCaption, _
        "Изменение пароля — " & roleCaption)

    If oldPw = "" Then
        ChangePasswordForRole = False
        Exit Function
    End If

    If MakeHash(oldPw) <> curHash Then
        failCount = failCount + 1
        MsgBox "Неверный пароль.", vbExclamation, "Ошибка"

        If failCount >= 3 And Not warnShown Then
            MsgBox "Если вы забыли пароль, обратитесь к администратору " & _
                   "для сброса пароля.", _
                   vbInformation, "Пароль не принят"
            warnShown = True
        End If
        GoTo CheckOld
    End If

    ' --- ввод нового пароля ---
    Dim p1 As String, p2 As String

NewPw:
    p1 = InputBox( _
        "Введите НОВЫЙ пароль для роли: " & roleCaption, _
        "Новый пароль — " & roleCaption)

    If p1 = "" Then
        ChangePasswordForRole = False
        Exit Function
    End If

    p2 = InputBox( _
        "Повторите НОВЫЙ пароль для роли: " & roleCaption, _
        "Подтверждение нового пароля")

    If p2 = "" Then
        ChangePasswordForRole = False
        Exit Function
    End If

    If p1 <> p2 Then
        MsgBox "Пароли не совпадают. Попробуйте ещё раз.", _
               vbExclamation, "Ошибка"
        GoTo NewPw
    End If

    SetNameValue hashName, MakeHash(p1)
    MsgBox "Пароль для роли """ & roleCaption & """ успешно изменён.", _
           vbInformation, "Пароль изменён"

    ChangePasswordForRole = True
End Function


' ------------------------ СБРОС ПАРОЛЕЙ (ДЛЯ АДМИНА) ------------------------

' Вызываешь ЭТОТ макрос вручную (через меню Макросы) ТОЛЬКО как админ:
'   - при ALLOW_PASSWORD_RESET = True
'   - при gCurrentRole = ROLE_ADMIN (или при отключённой защите — тогда роль уже админ)
Public Sub Admin_ResetAllPasswords()
    If Not ALLOW_PASSWORD_RESET Then
        MsgBox "Сброс паролей выключен в настройках модуля (ALLOW_PASSWORD_RESET = False).", _
               vbExclamation, "Сброс запрещён"
        Exit Sub
    End If

    If Not HasAdminRights() Then
        MsgBox "У вас нет прав администратора для сброса паролей.", _
               vbCritical, "Нет прав"
        Exit Sub
    End If

    If MsgBox("Сбросить ЛИЧНЫЕ пароли для сотрудника и руководителя?" & vbCrLf & _
              "При следующем входе им будет предложено задать новые пароли.", _
              vbYesNo + vbQuestion, "Сброс личных паролей") <> vbYes Then
        Exit Sub
    End If

    ' Удаляем значения хешей (делаем их пустыми)
    SetNameValue NAME_EMP_HASH, ""
    SetNameValue NAME_MGR_HASH, ""

    MsgBox "Личные пароли сотрудника и руководителя сброшены." & vbCrLf & _
           "При следующем входе им будет предложено создать новые пароли.", _
           vbInformation, "Сброс завершён"
End Sub


' ------------------------ РАБОТА С ИМЕНОВАННЫМИ ДИАПАЗОНАМИ ------------------------

' Чтение скрытого константного имени (RefersTo = "=""значение""")
Private Function GetNameValue(ByVal nm As String) As String
    Dim nmObj As Name
    Dim v As Variant

    On Error Resume Next
    Set nmObj = ThisWorkbook.names(nm)
    If nmObj Is Nothing Then
        GetNameValue = ""
    Else
        v = Application.Evaluate(nmObj.refersTo)
        If IsError(v) Then
            GetNameValue = ""
        ElseIf IsEmpty(v) Then
            GetNameValue = ""
        Else
            GetNameValue = CStr(v)
        End If
    End If
    On Error GoTo 0
End Function

' Запись скрытого константного имени
Private Sub SetNameValue(ByVal nm As String, ByVal value As String)
    Dim s As String
    Dim nmObj As Name

    s = "=""" & value & """"

    On Error Resume Next
    ThisWorkbook.names(nm).Delete
    On Error GoTo 0

    Set nmObj = ThisWorkbook.names.Add(Name:=nm, refersTo:=s)
    On Error Resume Next
    nmObj.Visible = False
    On Error GoTo 0
End Sub

' Примитивный хеш строки (чтобы в именах не лежал голый пароль)
Private Function MakeHash(ByVal s As String) As String
    Dim i As Long
    Dim acc As Long

    acc = 0
    For i = 1 To Len(s)
        acc = (acc * 33) Xor Asc(Mid$(s, i, 1))
    Next i

    MakeHash = CStr(acc)
End Function


' ------------------------ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ПРАВ ------------------------

Public Function IsAdmin() As Boolean
    IsAdmin = (gCurrentRole = ROLE_ADMIN)
End Function

Public Function HasAdminRights() As Boolean
    HasAdminRights = IsAdmin()
End Function

Public Function IsManager() As Boolean
    IsManager = (gCurrentRole = ROLE_MANAGER Or gCurrentRole = ROLE_ADMIN)
End Function

Public Function HasManagerRights() As Boolean
    HasManagerRights = IsManager()
End Function

Public Function IsEmployee() As Boolean
    IsEmployee = (gCurrentRole = ROLE_EMPLOYEE)
End Function

' Есть ли активный вход (любая роль, кроме ROLE_NONE)
Public Function IsLoggedIn() As Boolean
    IsLoggedIn = (gCurrentRole <> ROLE_NONE)
End Function

' Текущая роль в виде свойства (для внешних модулей, совместимость)
Public Property Get CurrentRole() As UserRoleLevel
    CurrentRole = gCurrentRole
End Property


