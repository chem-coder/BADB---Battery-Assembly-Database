VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Лист1"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
' === Лист: Дорожная_карта ===
Option Explicit

Private Sub Worksheet_Activate()
    ' Старая логика подсветки
    modДорожнаяКартаПодсветка.DK_Activate Me

    ' Новая логика: обеспечить триггер SUBTOTAL для графиков,
    ' если якорь Графики_SOH сейчас на этом листе.
    modCycling_Charts.EnsureCyclingRecalcTriggerOnSheet Me
End Sub

Private Sub Worksheet_SelectionChange(ByVal Target As Range)
    modДорожнаяКартаПодсветка.DK_SelectionChange Me, Target
End Sub

' Автообновление графиков по изменению срезов/фильтров (через SUBTOTAL-триггер)
Private Sub Worksheet_Calculate()
    On Error GoTo ExitHandler

    If Not Application.EnableEvents Then Exit Sub

    Application.EnableEvents = False
    Application.ScreenUpdating = False

    ' Перестроить графики только если именованная ячейка Графики_SOH
    ' сейчас реально находится на этом листе
    modCycling_Charts.Cycling_UpdateCharts_All Me

ExitHandler:
    Application.ScreenUpdating = True
    Application.EnableEvents = True
End Sub

Public Sub Test_RowHighlight_E33()
    Me.Activate
    Me.Range("E33").Select
End Sub

