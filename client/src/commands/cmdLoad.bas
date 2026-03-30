Attribute VB_Name = "cmdLoad"
Option Explicit

Public Sub Run(ByVal ctx As AppContext)
    Dim rawIds As String
    Dim projectIds As String
    Dim ok As Boolean

    If ctx Is Nothing Then
        MsgBox "Not authorized", vbExclamation, "Load"
        Exit Sub
    End If

    If Not ctx.IsAuthorized Then
        MsgBox "Not authorized", vbExclamation, "Load"
        Exit Sub
    End If

    rawIds = InputBox("Project IDs (comma-separated):", "Load")
    If Len(rawIds) = 0 Then Exit Sub

    projectIds = cleanIds(rawIds)
    If Len(projectIds) = 0 Then
        MsgBox "No valid project IDs provided.", vbInformation, "Load"
        Exit Sub
    End If

    ok = svcLoad.LoadProjects(ctx, projectIds)

    If ok Then
        MsgBox "Loaded " & Len(ctx.LastLoadResponse) & " chars", vbInformation, "Load"
    Else
        MsgBox "Load failed", vbExclamation, "Load"
    End If
End Sub

' ---------------------------------------------------------------------------
' Private: Clean and join comma-separated IDs (trim, skip empties)
' ---------------------------------------------------------------------------
Private Function cleanIds(ByVal rawIds As String) As String
    Dim parts As Variant
    Dim result As String
    Dim i As Long
    Dim currentId As String

    parts = Split(rawIds, ",")
    result = vbNullString

    For i = LBound(parts) To UBound(parts)
        currentId = Trim$(CStr(parts(i)))
        If Len(currentId) > 0 Then
            If Len(result) > 0 Then result = result & ","
            result = result & currentId
        End If
    Next i

    cleanIds = result
End Function
