VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Лист4"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
' === Лист: Служебный_лист ===
Option Explicit

Private Sub Worksheet_Activate()
    ' Если якорь Графики_SOH сейчас на этом листе — создаём/проверяем триггер SUBTOTAL
    modCycling_Charts.EnsureCyclingRecalcTriggerOnSheet Me
End Sub

Private Sub Worksheet_Calculate()
    On Error GoTo ExitHandler

    If Not Application.EnableEvents Then Exit Sub

    Application.EnableEvents = False
    Application.ScreenUpdating = False

    ' Перестроить графики, если Графики_SOH указывает на этот лист
    modCycling_Charts.Cycling_UpdateCharts_All Me

ExitHandler:
    Application.ScreenUpdating = True
    Application.EnableEvents = True
End Sub

Private Sub Worksheet_Change(ByVal Target As Range)
    Dim lo   As ListObject
    Dim rng  As Range
    Dim hit  As Boolean

    If Not Application.EnableEvents Then Exit Sub
    If Target Is Nothing Then Exit Sub
    If Target.CountLarge > 100000 Then Exit Sub  ' защита от гигантских изменений

    ' Проверяем, задело ли изменение таблицу "Список_Этапов"
    For Each lo In Me.ListObjects
        If StrComp(lo.Name, "Список_Этапов", vbTextCompare) = 0 _
           Or StrComp(lo.DisplayName, "Список_Этапов", vbTextCompare) = 0 Then

            On Error Resume Next
            Set rng = lo.DataBodyRange
            On Error GoTo 0

            If Not rng Is Nothing Then
                If Not Application.Intersect(Target, rng) Is Nothing Then
                    hit = True
                End If
            End If

            Exit For
        End If
    Next lo

    If Not hit Then Exit Sub

    Application.EnableEvents = False
    On Error GoTo ExitPoint

    ' Твой будущий код реакции на изменения в "Список_Этапов"
    ' (сейчас пусто — как и было)

ExitPoint:
    Application.EnableEvents = True
End Sub


