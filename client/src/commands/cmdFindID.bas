Attribute VB_Name = "cmdFindID"
Option Explicit

Public Sub Run(ByVal ctx As AppContext)
    If ctx Is Nothing Then
        MsgBox "Context is not set.", vbExclamation, "FindID"
        Exit Sub
    End If

    If Not ctx.IsAuthorized Then
        MsgBox "Not authorized. Please login first.", vbExclamation, "FindID"
        Exit Sub
    End If

    If Len(ctx.LastLoadResponse) = 0 Then
        MsgBox "No data loaded. Use Load first.", vbExclamation, "FindID"
        Exit Sub
    End If

    Dim entityId As String
    entityId = InputBox("Enter ID to search:", "FindID")
    If Len(Trim$(entityId)) = 0 Then Exit Sub

    Dim result As String
    result = svcSearch.FindById(ctx.LastLoadResponse, Trim$(entityId))

    If Len(result) = 0 Then
        MsgBox "Not found: " & entityId, vbInformation, "FindID"
    Else
        MsgBox Left$(result, 500), vbInformation, "FindID"
    End If
End Sub
