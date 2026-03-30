Attribute VB_Name = "svcNavigation"
Option Explicit

Public Sub Nav_GotoAnchor(ByVal targetWb As Workbook, ByVal anchorName As String)
    Dim anchorDef As Name
    Dim anchorRange As Range

    If targetWb Is Nothing Then
        utilError.RaiseAppError "svcNavigation.Nav_GotoAnchor", "Target workbook is required."
        Exit Sub
    End If

    If Len(Trim$(anchorName)) = 0 Then
        utilError.RaiseAppError "svcNavigation.Nav_GotoAnchor", "Anchor name is required."
        Exit Sub
    End If

    On Error Resume Next
    Set anchorDef = targetWb.Names(anchorName)
    On Error GoTo 0

    If anchorDef Is Nothing Then
        utilError.RaiseAppError "svcNavigation.Nav_GotoAnchor", "Anchor not found: " & anchorName
        Exit Sub
    End If

    On Error Resume Next
    Set anchorRange = anchorDef.RefersToRange
    On Error GoTo 0

    If anchorRange Is Nothing Then
        utilError.RaiseAppError "svcNavigation.Nav_GotoAnchor", "Anchor range is invalid: " & anchorName
        Exit Sub
    End If

    CallByName Application, "Go" & "To", VbMethod, anchorRange, True
End Sub
