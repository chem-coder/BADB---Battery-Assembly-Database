Attribute VB_Name = "cmdSync"
Option Explicit

' cmdSync - Create a sync package (MVP: package only, no DB apply)

Public Sub Run(ByVal ctx As AppContext)
    If ctx Is Nothing Then
        MsgBox "Context is not set.", vbExclamation, "Sync"
        Exit Sub
    End If

    If Not ctx.IsAuthorized Then
        MsgBox "Not authorized. Please login first.", vbExclamation, "Sync"
        Exit Sub
    End If

    Dim ans As VbMsgBoxResult
    ans = MsgBox("Create sync package (MVP; no DB changes will be applied)?", vbYesNo + vbQuestion, "Sync")
    If ans <> vbYes Then Exit Sub

    Dim s As String
    s = InputBox("Project IDs (comma-separated):", "Sync", "")

    Dim ids As Variant
    ids = ParseIds(s)

    If Not HasAny(ids) Then
        MsgBox "No Project IDs provided.", vbExclamation, "Sync"
        Exit Sub
    End If

    Dim jsonText As String
    jsonText = BuildJson(ctx, ids)

    ' Choose delivery method
    Dim deliveryChoice As VbMsgBoxResult
    deliveryChoice = MsgBox("Send to server? (Yes = HTTP, No = file queue)", _
                            vbYesNo + vbQuestion, "Sync")

    If deliveryChoice = vbYes Then
        Dim httpOk As Boolean
        httpOk = svcSubmit.SubmitPackage(ctx, jsonText)

        If httpOk Then
            MsgBox "Package sent to server.", vbInformation, "Sync"
            Exit Sub
        End If

        ' HTTP failed — offer fallback
        Dim fallbackChoice As VbMsgBoxResult
        fallbackChoice = MsgBox("Server unavailable. Save to file queue?", _
                                vbYesNo + vbExclamation, "Sync")

        If fallbackChoice <> vbYes Then
            MsgBox "Package was NOT saved.", vbExclamation, "Sync"
            Exit Sub
        End If
    End If

    ' File queue path (chosen directly or as fallback)
    On Error Resume Next
    Err.Clear

    Dim outPath As String
    outPath = svcPackages.Packages_WriteJson(ctx, cfgApp.CMD_SYNC, jsonText)

    If Err.Number <> 0 Or Len(Trim$(outPath)) = 0 Then
        Dim eNum As Long
        Dim eDesc As String
        eNum = Err.Number
        eDesc = Err.Description
        Err.Clear
        On Error GoTo 0
        MsgBox "Failed to create package." & vbCrLf & eNum & " - " & eDesc, vbExclamation, "Sync"
        Exit Sub
    End If

    On Error GoTo 0

    MsgBox "Package created:" & vbCrLf & outPath, vbInformation, "Sync"
End Sub

' -----------------------
' Helpers (UI allowed here)
' -----------------------

Private Function HasAny(ByVal v As Variant) As Boolean
    On Error Resume Next
    ' True if array and has at least one element
    HasAny = (IsArray(v) And (UBound(v) >= LBound(v)))
    If Err.Number <> 0 Then
        Err.Clear
        HasAny = False
    End If
    On Error GoTo 0
End Function

Private Function ParseIds(ByVal s As String) As Variant
    Dim col As Collection
    Set col = New Collection

    Dim raw As String
    raw = Trim$(s)

    If Len(raw) = 0 Then
        ParseIds = Array()
        Exit Function
    End If

    Dim parts() As String
    parts = Split(raw, ",")

    Dim i As Long
    For i = LBound(parts) To UBound(parts)
        Dim v As String
        v = Trim$(parts(i))
        If Len(v) > 0 Then
            Dim key As String
            key = UCase$(v)
            On Error Resume Next
            col.Add v, key
            On Error GoTo 0
        End If
    Next i

    If col.Count = 0 Then
        ParseIds = Array()
        Exit Function
    End If

    Dim arr() As String
    ReDim arr(0 To col.Count - 1)

    For i = 1 To col.Count
        arr(i - 1) = CStr(col(i))
    Next i

    ParseIds = arr
End Function

Private Function BuildJson(ByVal ctx As AppContext, ByVal ids As Variant) As String
    Dim createdAt As String
    createdAt = Format$(Now, "yyyy-mm-dd hh:nn:ss")

    Dim reqId As String
    reqId = "sync_" & Format$(Now, "yymmddhhnnss")

    Dim userName As String
    userName = ctx.UserName
    If Len(Trim$(userName)) = 0 Then userName = "user"

    Dim roleName As String
    roleName = ctx.Role
    If Len(Trim$(roleName)) = 0 Then roleName = "Unknown"

    Dim i As Long
    Dim listJson As String
    listJson = "["

    For i = LBound(ids) To UBound(ids)
        If i > LBound(ids) Then listJson = listJson & ","
        listJson = listJson & """" & JsonEscape(CStr(ids(i))) & """"
    Next i

    listJson = listJson & "]"

    Dim j As String
    j = "{"
    j = j & """schema"":1,"
    j = j & """requestType"":""Sync"","
    j = j & """requestId"":""" & JsonEscape(reqId) & ""","
    j = j & """createdAt"":""" & JsonEscape(createdAt) & ""","
    j = j & """user"":""" & JsonEscape(userName) & ""","
    j = j & """role"":""" & JsonEscape(roleName) & ""","
    j = j & """projectIds"":" & listJson & ","
    j = j & """note"":""MVP package only; processor applies later.""}"

    BuildJson = j
End Function

Private Function JsonEscape(ByVal s As String) As String
    Dim t As String
    t = s
    t = Replace(t, "\", "\\")
    t = Replace(t, """", "\""")
    t = Replace(t, vbCrLf, "\n")
    t = Replace(t, vbCr, "\n")
    t = Replace(t, vbLf, "\n")
    JsonEscape = t
End Function
