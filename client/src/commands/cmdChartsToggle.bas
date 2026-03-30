Attribute VB_Name = "cmdChartsToggle"
Option Explicit

Public Sub Run(ByVal ctx As AppContext, ByVal pressed As Boolean)
    svcCharts.Charts_ApplyVisibility ctx, pressed
End Sub
