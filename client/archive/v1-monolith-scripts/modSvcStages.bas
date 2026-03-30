Attribute VB_Name = "modSvcStages"
' === modSvcStages ===
Option Explicit

Private Const SVC_SHEET         As String = "Служебный_лист"
Private Const NAME_STAGE_SEARCH As String = "Этап_поиск"   ' если у тебя в книге именно так

' -----------------------------------------------
' 1) КНОПКА "ОткрытьВсеЭтапы"
' -----------------------------------------------
Public Sub ОткрытьВсеЭтапы()
    On Error GoTo ErrHandler

    Application.EnableEvents = False
    Application.StatusBar = "Обновление этапов (Power Query)..."

    ' КНОПКА по-прежнему дергает полный рефреш ВСЕХ нужных запросов
    modPQ.ForceRefreshNow

CleanExit:
    Application.StatusBar = False
    Application.EnableEvents = True
    Exit Sub

ErrHandler:
    Debug.Print "ОткрытьВсеЭтапы: ошибка " & Err.Number & " - " & Err.Description
    Resume CleanExit
End Sub

' -----------------------------------------------
' 2) АВТООБНОВЛЕНИЕ ПО ИЗМЕНЕНИЮ Этап_поиск
' -----------------------------------------------
' БОЛЬШЕ НЕ ДЕЛАЕМ ГЛОБАЛЬНЫЙ РЕФРЕШ.
' Автообновление отбора вынесено в modPickRefresh.HandleSheetChange.
Public Sub HandleServiceChange(ByVal ws As Worksheet, ByVal Target As Range)
    ' Либо оставляем пустым, либо вообще НЕ вызываем его из ThisWorkbook.
End Sub

