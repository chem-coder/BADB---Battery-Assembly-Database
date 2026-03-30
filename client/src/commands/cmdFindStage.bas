Attribute VB_Name = "cmdFindStage"
Option Explicit

Public Sub Run(ByVal ctx As AppContext)
    If ctx Is Nothing Then
        MsgBox "Context is not set.", vbExclamation, "FindStage"
        Exit Sub
    End If

    If Not ctx.IsAuthorized Then
        MsgBox "Not authorized. Please login first.", vbExclamation, "FindStage"
        Exit Sub
    End If

    If Len(ctx.LastLoadResponse) = 0 Then
        MsgBox "No data loaded. Use Load first.", vbExclamation, "FindStage"
        Exit Sub
    End If

    Dim stageCode As String
    stageCode = InputBox("Operation type (mixing/coating/drying_tape/calendering/...):", "FindStage")
    If Len(Trim$(stageCode)) = 0 Then Exit Sub

    Dim result As String
    result = svcSearch.FindByStage(ctx.LastLoadResponse, Trim$(stageCode))

    If Len(result) = 0 Then
        MsgBox "Not found: " & stageCode, vbInformation, "FindStage"
    Else
        MsgBox Left$(result, 500), vbInformation, "FindStage"
    End If
End Sub
