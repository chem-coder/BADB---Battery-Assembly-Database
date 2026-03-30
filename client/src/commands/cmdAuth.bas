Attribute VB_Name = "cmdAuth"
Option Explicit

Public Sub Run(ByVal ctx As AppContext)
    Dim login As String
    Dim password As String
    Dim ok As Boolean

    If ctx Is Nothing Then
        utilError.RaiseAppError "cmdAuth.Run", "Context is required."
        Exit Sub
    End If

    login = InputBox("Login:", "Login", Environ$("USERNAME"))
    If Len(login) = 0 Then Exit Sub

    password = InputBox("Password:", "Login")
    If Len(password) = 0 Then Exit Sub

    ok = svcAuth.Authenticate(ctx, login, password)

    If ok Then
        MsgBox "Login OK. Role=" & ctx.Role, vbInformation, "Login"
    Else
        svcAuth.Auth_Clear ctx
        MsgBox "Invalid credentials. Contact admin.", vbExclamation, "Login"
    End If
End Sub
