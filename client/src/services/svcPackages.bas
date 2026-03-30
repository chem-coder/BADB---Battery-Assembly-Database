Attribute VB_Name = "svcPackages"
Option Explicit

' svcPackages - File-based packages queue (no UI)

Public Sub Packages_Prepare(ByVal ctx As AppContext)
    If ctx Is Nothing Then
        utilError.RaiseAppError "svcPackages.Packages_Prepare", "Context is not set."
    End If

    Dim rootPath As String
    rootPath = cfgApp.QUEUE_ROOT_WIN

    If Len(Trim$(rootPath)) = 0 Then
        utilError.RaiseAppError "svcPackages.Packages_Prepare", "QUEUE_ROOT_WIN is empty."
    End If

    EnsureFolder rootPath
    EnsureFolder PathCombine(rootPath, cfgApp.QUEUE_DIR_INBOX)
    EnsureFolder PathCombine(rootPath, cfgApp.QUEUE_DIR_PROCESSED)
    EnsureFolder PathCombine(rootPath, cfgApp.QUEUE_DIR_REJECTED)
    EnsureFolder PathCombine(rootPath, cfgApp.QUEUE_DIR_LOGS)

    Dim userInbox As String
    userInbox = Packages_GetUserInboxFolder(ctx)
    EnsureFolder userInbox
End Sub

Public Function Packages_WriteJson(ByVal ctx As AppContext, ByVal requestType As String, ByVal jsonText As String) As String
    If ctx Is Nothing Then
        utilError.RaiseAppError "svcPackages.Packages_WriteJson", "Context is not set."
    End If

    Packages_Prepare ctx

    Dim folderPath As String
    folderPath = Packages_GetUserInboxFolder(ctx)

    Dim reqId As String
    reqId = Packages_NewRequestId()

    Dim ts As String
    ts = Format$(Now, "yyyy-mm-dd_hhnnss")

    Dim userSafe As String
    userSafe = Packages_UserSafe(ctx)

    Dim fileName As String
    fileName = ts & "_" & userSafe & "_" & reqId & ".json"

    Dim finalPath As String
    finalPath = PathCombine(folderPath, fileName)

    Dim tmpPath As String
    tmpPath = finalPath & ".tmp"

    SafeDeleteFile tmpPath
    SafeDeleteFile finalPath

    Dim ff As Integer
    ff = FreeFile

    On Error Resume Next
    Err.Clear

    Open tmpPath For Output As #ff
    If Err.Number <> 0 Then
        On Error Resume Next
        Close #ff
        On Error GoTo 0
        utilError.RaiseAppError "svcPackages.Packages_WriteJson", "Open tmp failed: " & Err.Number & " - " & Err.Description
    End If

    Print #ff, jsonText
    If Err.Number <> 0 Then
        On Error Resume Next
        Close #ff
        On Error GoTo 0
        utilError.RaiseAppError "svcPackages.Packages_WriteJson", "Write tmp failed: " & Err.Number & " - " & Err.Description
    End If

    Close #ff
    If Err.Number <> 0 Then
        On Error Resume Next
        Close #ff
        On Error GoTo 0
        utilError.RaiseAppError "svcPackages.Packages_WriteJson", "Close tmp failed: " & Err.Number & " - " & Err.Description
    End If

    Name tmpPath As finalPath
    If Err.Number <> 0 Then
        utilError.RaiseAppError "svcPackages.Packages_WriteJson", "Rename tmp->final failed: " & Err.Number & " - " & Err.Description
    End If

    On Error GoTo 0

    Packages_WriteJson = finalPath
End Function

Public Function Packages_GetUserInboxFolder(ByVal ctx As AppContext) As String
    If ctx Is Nothing Then
        utilError.RaiseAppError "svcPackages.Packages_GetUserInboxFolder", "Context is not set."
    End If

    Dim rootPath As String
    rootPath = cfgApp.QUEUE_ROOT_WIN

    Dim userName As String
    userName = Packages_UserSafe(ctx)

    Dim inboxRoot As String
    inboxRoot = PathCombine(rootPath, cfgApp.QUEUE_DIR_INBOX)

    Packages_GetUserInboxFolder = PathCombine(inboxRoot, userName)
End Function

' -----------------------
' Helpers (no UI)
' -----------------------

Private Function Packages_UserSafe(ByVal ctx As AppContext) As String
    Dim u As String
    u = Trim$(ctx.UserName)

    If Len(u) = 0 Then
        On Error Resume Next
        u = Environ$("USERNAME")
        On Error GoTo 0
    End If

    If Len(u) = 0 Then u = "user"

    u = Replace(u, "\", "-")
    u = Replace(u, "/", "-")
    u = Replace(u, " ", "_")
    u = Replace(u, ":", "-")
    u = Replace(u, Chr$(9), "_")

    Packages_UserSafe = u
End Function

Private Function Packages_NewRequestId() As String
    Randomize
    Dim n As Long
    n = CLng((Rnd() * 900000) + 100000)
    Packages_NewRequestId = Format$(Now, "yymmddhhnnss") & "_" & CStr(n)
End Function

Private Function DetectSep(ByVal p As String) As String
    If InStr(1, p, "\", vbBinaryCompare) > 0 Then
        DetectSep = "\"
    ElseIf InStr(1, p, ":", vbBinaryCompare) > 0 And InStr(1, p, "/", vbBinaryCompare) = 0 Then
        DetectSep = ":"
    Else
        DetectSep = "/"
    End If
End Function

Private Function PathCombine(ByVal basePath As String, ByVal part As String) As String
    Dim sep As String
    sep = DetectSep(basePath)

    Dim a As String, b As String
    a = basePath
    b = part

    If Right$(a, 1) = sep Then
        If Left$(b, 1) = sep Then
            PathCombine = a & Mid$(b, 2)
        Else
            PathCombine = a & b
        End If
    Else
        If Left$(b, 1) = sep Then
            PathCombine = a & b
        Else
            PathCombine = a & sep & b
        End If
    End If
End Function

Private Sub EnsureFolder(ByVal folderPath As String)
    If Len(folderPath) = 0 Then Exit Sub
    If FolderExists(folderPath) Then Exit Sub

    Dim sep As String
    sep = DetectSep(folderPath)

    Dim parts() As String
    parts = Split(folderPath, sep)

    Dim cur As String
    cur = ""

    Dim i As Long
    Dim startIdx As Long
    startIdx = 0

    If sep = "\" And Left$(folderPath, 2) = "\\" Then
        ' UNC: \\Server\Share\...
        If UBound(parts) < 3 Then Exit Sub
        cur = "\\" & parts(2) & "\" & parts(3)
        startIdx = 4
    ElseIf sep = "/" And Left$(folderPath, 1) = "/" Then
        cur = "/"
        startIdx = 1
    Else
        cur = parts(0)
        startIdx = 1
    End If

    For i = startIdx To UBound(parts)
        If Len(parts(i)) > 0 Then
            If cur = "/" Then
                cur = cur & parts(i)
            Else
                cur = cur & sep & parts(i)
            End If

            If Not FolderExists(cur) Then
                On Error Resume Next
                MkDir cur
                On Error GoTo 0
            End If
        End If
    Next i
End Sub

Private Function FolderExists(ByVal folderPath As String) As Boolean
    Dim s As String
    On Error Resume Next
    s = Dir(folderPath, vbDirectory)
    On Error GoTo 0
    FolderExists = (Len(s) > 0)
End Function

Private Sub SafeDeleteFile(ByVal filePath As String)
    If Len(filePath) = 0 Then Exit Sub
    On Error Resume Next
    If Len(Dir$(filePath)) > 0 Then Kill filePath
    On Error GoTo 0
End Sub
