Attribute VB_Name = "modPQ"
' === modPQ ===

Option Explicit

' ---- Имена запросов, которые остаются в общем рефреше ----
Private Const Q_COMBINED As String = "Этапы_Объединённые"
Private Const Q_SERIES   As String = "Справочник_Серий_по_этапам"

' ---- Анти-дребезг и тайминги для полного прогона (на будущее) ----
Private Const MIN_GAP_SEC As Long = 2
Private Const DEFER_SEC   As Long = 1

' ---- Служебное состояние ----
Private m_nextDue     As Date
Private m_isRunning   As Boolean
Private m_autoEnabled As Boolean
Private m_lastRun     As Date

' ---- Замок от реентерабельности/гонок ----
Private m_lockCount   As Long

' ---- Коллекция хуков на все листы (CPQHook) ----
Private m_hooks As Collection

'================= ПУБЛИЧНЫЙ ИНТЕРФЕЙС =================

' Инициализация при открытии книги
Public Sub InitOnOpen()
    AutoRefreshOn
    Reset
    HookAllSheets
    RunRefresh                 ' первичная синхронизация (Этапы_Объединённые, Справочник_Серий_по_этапам)
End Sub

' Сейчас автотрекинг изменений через этот хук не используется.
' Оставлено как заглушка на будущее, чтобы не ломать старые вызовы.
Public Sub HandleSheetChange(ByVal Sh As Object, ByVal Target As Range)
    ' Авто-реакция отключена.
End Sub

' Ручной полный запуск (можно вызывать из других макросов)
Public Sub ForceRefreshNow()
    RunRefresh
End Sub

' Хук для логики «после сохранения шаблона»
Public Sub TriggerAfterTemplateSave()
    RunRefresh
End Sub

' Для Workbook_NewSheet / Workbook_SheetActivate — переподписка хуков (на будущее)
Public Sub RehookAllSheets()
    HookAllSheets
End Sub

' Отключить/включить авто-режим (оставлено для совместимости)
Public Sub AutoRefreshOff()
    m_autoEnabled = False
    Reset
End Sub

Public Sub AutoRefreshOn()
    m_autoEnabled = True
End Sub

' Сброс внутренних таймеров/флагов
Public Sub Reset()
    On Error Resume Next
    If m_nextDue <> 0 Then
        Application.OnTime m_nextDue, "modPQ.RunRefresh", , False
    End If
    On Error GoTo 0

    m_nextDue = 0
    m_isRunning = False
    m_lastRun = 0
    m_lockCount = 0
End Sub

'================= УТИЛИТЫ (артефакты ExternalData_2) =================

Public Sub ListExternalArtifacts()
    Dim s As String, nm As Name, cn As WorkbookConnection

    s = s & "[Names like ExternalData_*]" & vbCrLf
    For Each nm In ThisWorkbook.names
        If LCase$(Left$(nm.Name, 13)) = "externaldata_" Then
            s = s & "  " & nm.Name & " -> " & nm.refersTo & vbCrLf
        End If
    Next nm

    s = s & vbCrLf & "[Connections]" & vbCrLf
    For Each cn In ThisWorkbook.Connections
        s = s & "  " & cn.Name & " (Type=" & cn.Type & ")" & vbCrLf
    Next cn

    MsgBox s, vbInformation, "External artifacts"
End Sub

Public Sub DisableExternalData2()
    Dim nm As Name, cn As WorkbookConnection

    On Error Resume Next
    For Each cn In ThisWorkbook.Connections
        cn.OLEDBConnection.BackgroundQuery = False
        cn.ODBCConnection.BackgroundQuery = False
        cn.RefreshOnFileOpen = False
    Next cn
    On Error GoTo 0

    On Error Resume Next
    For Each nm In ThisWorkbook.names
        If StrComp(nm.Name, "ExternalData_2", vbTextCompare) = 0 Then nm.Delete
    Next nm
    On Error GoTo 0

    On Error Resume Next
    For Each cn In ThisWorkbook.Connections
        If InStr(1, cn.Name, "ExternalData_2", vbTextCompare) > 0 Then
            cn.RefreshOnFileOpen = False
            ' cn.Delete ' <- можно раскомментировать, если совсем не нужен
        End If
    Next cn
    On Error GoTo 0

    MsgBox "ExternalData_2: проверено/отключено.", vbInformation
End Sub

'================= ПОЛНЫЙ ПРОГОН ОСТАВШИХСЯ ЗАПРОСОВ =================

Public Sub RunRefresh()
    Dim oldEvents As Boolean, oldAlerts As Boolean, oldCalc As XlCalculation

    If m_isRunning Then Exit Sub
    m_isRunning = True

    ' снять отложенный, если был
    On Error Resume Next
    If m_nextDue <> 0 Then Application.OnTime m_nextDue, "modPQ.RunRefresh", , False
    m_nextDue = 0
    On Error GoTo 0

    On Error GoTo FinallyFull

    PQ_Lock

    oldEvents = Application.EnableEvents
    oldAlerts = Application.DisplayAlerts
    oldCalc = Application.Calculation

    Application.EnableEvents = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual

    ' ScreenUpdating не трогаем, чтобы интерфейс не мигал
    ForceSynchronousConnections

    ' Остаются только:
    '   Этапы_Объединённые
    '   Справочник_Серий_по_этапам
    RefreshOne Q_COMBINED
    RefreshOne Q_SERIES

FinallyFull:
    m_lastRun = Now
    Application.Calculation = oldCalc
    Application.DisplayAlerts = oldAlerts
    Application.EnableEvents = oldEvents
    PQ_Unlock
    m_isRunning = False
End Sub

'================= ПЛАНИРОВАНИЕ ПОЛНОГО ПРОГОНА (если понадобится) =================

Private Sub ThrottledSchedule()
    On Error Resume Next
    If m_isRunning Then Exit Sub
    If TooSoon(MIN_GAP_SEC) Then Exit Sub
    If m_nextDue <> 0 Then Application.OnTime m_nextDue, "modPQ.RunRefresh", , False
    m_nextDue = Now + TimeSerial(0, 0, DEFER_SEC)
    Application.OnTime m_nextDue, "modPQ.RunRefresh"
    On Error GoTo 0
End Sub

Private Function TooSoon(ByVal sec As Long) As Boolean
    If m_lastRun = 0 Then
        TooSoon = False
    Else
        TooSoon = (Now - m_lastRun) < (sec / 86400#)
    End If
End Function

'================= РЕФРЕШ ОДНОГО ОБЪЕКТА =================

Private Sub RefreshOne(ByVal nameOrSubstr As String)
    If Len(nameOrSubstr) = 0 Then Exit Sub
    If Not TryRefreshByListObjectName(nameOrSubstr) Then
        If Not TryRefreshByConnectionSubstring(nameOrSubstr) Then
            ' не найдено — молча пропускаем
        End If
    End If
End Sub

Private Function TryRefreshByListObjectName(ByVal tableName As String) As Boolean
    Dim ws As Worksheet, lo As ListObject
    On Error GoTo ExitFn
    For Each ws In ThisWorkbook.Worksheets
        For Each lo In ws.ListObjects
            If StrComp(lo.Name, tableName, vbTextCompare) = 0 _
            Or StrComp(lo.DisplayName, tableName, vbTextCompare) = 0 Then
                If Not lo.QueryTable Is Nothing Then
                    lo.QueryTable.Refresh BackgroundQuery:=False
                    TryRefreshByListObjectName = True
                    Exit Function
                End If
            End If
        Next lo
    Next ws
ExitFn:
End Function

Private Function TryRefreshByConnectionSubstring(ByVal needle As String) As Boolean
    Dim cn As WorkbookConnection
    On Error GoTo ExitFn
    For Each cn In ThisWorkbook.Connections
        If InStr(1, cn.Name, needle, vbTextCompare) > 0 Then
            On Error Resume Next
            cn.OLEDBConnection.BackgroundQuery = False
            cn.ODBCConnection.BackgroundQuery = False
            On Error GoTo 0
            cn.Refresh
            TryRefreshByConnectionSubstring = True
            Exit Function
        End If
    Next cn
ExitFn:
End Function

' Сделать все подключения синхронными
Private Sub ForceSynchronousConnections()
    Dim cn As WorkbookConnection
    On Error Resume Next
    For Each cn In ThisWorkbook.Connections
        cn.OLEDBConnection.BackgroundQuery = False
        cn.ODBCConnection.BackgroundQuery = False
    Next cn
    On Error GoTo 0
End Sub

'================= ЗАМОК =================

Public Sub PQ_Lock()
    m_lockCount = m_lockCount + 1
End Sub

Public Sub PQ_Unlock()
    If m_lockCount > 0 Then m_lockCount = m_lockCount - 1
End Sub

Public Property Get IsLocked() As Boolean
    IsLocked = (m_lockCount > 0)
End Property

'================= ХУКИ НА ВСЕ ЛИСТЫ (оставлены для совместимости) =================

Private Sub HookAllSheets()
    Dim ws As Worksheet
    Set m_hooks = New Collection
    For Each ws In ThisWorkbook.Worksheets
        HookOne ws
    Next ws
End Sub

Private Sub HookOne(ByVal ws As Worksheet)
    Dim h As CPQHook
    Set h = New CPQHook
    Set h.ws = ws
    m_hooks.Add h
End Sub


