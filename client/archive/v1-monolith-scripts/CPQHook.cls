VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "CPQHook"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
'=== CPQHook (CLASS) ===
Option Explicit

Public WithEvents ws As Worksheet
Attribute ws.VB_VarHelpID = -1
Private m_qtDepth As Long

Private Sub ws_QueryTableBeforeRefresh(ByVal qt As QueryTable, Cancel As Boolean)
    modPQ.PQ_Lock
    m_qtDepth = m_qtDepth + 1
End Sub

Private Sub ws_QueryTableAfterRefresh(ByVal qt As QueryTable, ByVal Success As Boolean)
    If m_qtDepth > 0 Then m_qtDepth = m_qtDepth - 1
    If m_qtDepth = 0 Then
        On Error Resume Next
        Application.OnTime Now + TimeSerial(0, 0, 1), "modPQ.PostRefreshCleanup"
        On Error GoTo 0
        modPQ.PQ_Unlock
    End If
End Sub

