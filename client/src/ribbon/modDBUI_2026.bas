Attribute VB_Name = "modDBUI_2026"
Option Explicit

Private mRibbon As Object

Public Sub DBUI_2026_OnRibbonLoad(ByVal ribbon As Object)
    Set mRibbon = ribbon
End Sub

Public Sub DBUI_2026_Invalidate()
    On Error Resume Next

    If Not mRibbon Is Nothing Then
        mRibbon.Invalidate
    End If

    On Error GoTo 0
End Sub

Public Sub DBUI_2026_GetEnabled(ByVal control As Object, ByRef returnedVal)
    Dim controlId As String

    controlId = vbNullString

    On Error Resume Next
    controlId = CStr(control.ID)
    On Error GoTo 0

    If StrComp(controlId, "btnDBLogin", vbTextCompare) = 0 Then
        returnedVal = True
    Else
        returnedVal = modRouter.Router_IsAuthorized()
    End If
End Sub

Public Sub DBUI_2026_GetChartsPressed(ByVal control As Object, ByRef returnedVal)
    returnedVal = modRouter.Router_GetChartsPressed()
End Sub

Public Sub DBUI_2026_OnLogin(ByVal control As Object)
    modRouter.Router_RunCommand cfgApp.CMD_LOGIN
    DBUI_2026_Invalidate
End Sub

Public Sub DBUI_2026_OnLoadData(ByVal control As Object)
    modRouter.Router_RunCommand cfgApp.CMD_LOAD
    DBUI_2026_Invalidate
End Sub

Public Sub DBUI_2026_OnSync(ByVal control As Object)
    modRouter.Router_RunCommand cfgApp.CMD_SYNC
    DBUI_2026_Invalidate
End Sub

Public Sub DBUI_2026_OnShare(ByVal control As Object)
    modRouter.Router_RunCommand cfgApp.CMD_SHARE
    DBUI_2026_Invalidate
End Sub

Public Sub DBUI_2026_OnAdd(ByVal control As Object)
    modRouter.Router_RunCommand cfgApp.CMD_ADD
    DBUI_2026_Invalidate
End Sub

Public Sub DBUI_2026_OnFindID(ByVal control As Object)
    modRouter.Router_RunCommand cfgApp.CMD_FIND_ID
    DBUI_2026_Invalidate
End Sub

Public Sub DBUI_2026_OnFindAllStages(ByVal control As Object)
    modRouter.Router_RunCommand cfgApp.CMD_FIND_ALL_STAGES
    DBUI_2026_Invalidate
End Sub

Public Sub DBUI_2026_OnFindStage(ByVal control As Object)
    modRouter.Router_RunCommand cfgApp.CMD_FIND_STAGE
    DBUI_2026_Invalidate
End Sub

Public Sub DBUI_2026_OnNewTemplate(ByVal control As Object)
    modRouter.Router_RunCommand cfgApp.CMD_NEW_TEMPLATE
    DBUI_2026_Invalidate
End Sub

Public Sub DBUI_2026_OnChartsToggle(ByVal control As Object, ByVal pressed As Boolean)
    modRouter.Router_SetChartsPressed pressed
    modRouter.Router_RunToggle cfgApp.CMD_CHARTS_TOGGLE, pressed
    DBUI_2026_Invalidate
End Sub
