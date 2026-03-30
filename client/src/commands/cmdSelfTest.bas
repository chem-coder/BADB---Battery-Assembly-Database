Attribute VB_Name = "cmdSelfTest"
Option Explicit

Public Sub Run(ByVal ctx As AppContext)
    RunAll
End Sub

Public Sub RunAll()
    Dim ctx As AppContext

    Set ctx = New AppContext
    ctx.Reset

    On Error Resume Next
    Err.Clear
    cmdAuth.Run ctx

    If Err.Number <> 0 Then
        MsgBox "SelfTest FAIL: " & CStr(Err.Number) & " - " & Err.Description, vbExclamation, "SelfTest"
        Err.Clear
        On Error GoTo 0
        Exit Sub
    End If

    On Error GoTo 0

    MsgBox "SelfTest Context:" & vbCrLf & _
           "UserName=" & ctx.UserName & vbCrLf & _
           "Role=" & ctx.Role & vbCrLf & _
           "IsAuthorized=" & CStr(ctx.IsAuthorized), vbInformation, "SelfTest"
End Sub
