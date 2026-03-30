Attribute VB_Name = "svcCharts"
Option Explicit

Public Sub Charts_ApplyVisibility(ByVal ctx As AppContext, ByVal showCharts As Boolean)
    If ctx Is Nothing Then
        utilError.RaiseAppError "svcCharts.Charts_ApplyVisibility", "Context is required."
        Exit Sub
    End If
End Sub
