Attribute VB_Name = "svcTemplates"
Option Explicit

Public Sub Templates_CreateNew(ByVal ctx As AppContext)
    If ctx Is Nothing Then
        utilError.RaiseAppError "svcTemplates.Templates_CreateNew", "Context is required."
        Exit Sub
    End If
End Sub
