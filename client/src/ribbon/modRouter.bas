Attribute VB_Name = "modRouter"
Option Explicit

Private mCtx As AppContext
Private mChartsPressed As Boolean

Public Function Router_GetContext() As AppContext
    If mCtx Is Nothing Then
        Set mCtx = New AppContext
        mCtx.Reset
    End If

    Set Router_GetContext = mCtx
End Function

Public Function Router_IsAuthorized() As Boolean
    Router_IsAuthorized = Router_GetContext().IsAuthorized
End Function

Public Function Router_GetChartsPressed() As Boolean
    Router_GetChartsPressed = mChartsPressed
End Function

Public Sub Router_SetChartsPressed(ByVal pressed As Boolean)
    mChartsPressed = pressed
End Sub

Public Sub Router_RunCommand(ByVal cmdKey As String)
    Dim ctx As AppContext
    Dim keys As Variant
    Dim procs As Variant
    Dim i As Long

    Set ctx = Router_GetContext()

    keys = Array( _
        cfgApp.CMD_LOGIN, _
        cfgApp.CMD_LOAD, _
        cfgApp.CMD_SYNC, _
        cfgApp.CMD_SHARE, _
        cfgApp.CMD_ADD, _
        cfgApp.CMD_FIND_ID, _
        cfgApp.CMD_FIND_ALL_STAGES, _
        cfgApp.CMD_FIND_STAGE, _
        cfgApp.CMD_NEW_TEMPLATE _
    )

    procs = Array( _
        "cmdAuth.Run", _
        "cmdLoad.Run", _
        "cmdSync.Run", _
        "cmdShare.Run", _
        "cmdAdd.Run", _
        "cmdFindID.Run", _
        "cmdFindAllStages.Run", _
        "cmdFindStage.Run", _
        "cmdNewTemplate.Run" _
    )

    For i = LBound(keys) To UBound(keys)
        If StrComp(CStr(keys(i)), cmdKey, vbTextCompare) = 0 Then
            On Error Resume Next
            Err.Clear

            Application.Run CStr(procs(i)), ctx

            If Err.Number <> 0 Then
                utilLog.LogError CStr(procs(i)), Err.Number, Err.Description
                Err.Clear
            End If

            On Error GoTo 0
            Exit Sub
        End If
    Next i
End Sub

Public Sub Router_RunToggle(ByVal cmdKey As String, ByVal pressed As Boolean)
    Dim ctx As AppContext
    Dim keys As Variant
    Dim procs As Variant
    Dim i As Long

    Set ctx = Router_GetContext()

    keys = Array(cfgApp.CMD_CHARTS_TOGGLE)
    procs = Array("cmdChartsToggle.Run")

    For i = LBound(keys) To UBound(keys)
        If StrComp(CStr(keys(i)), cmdKey, vbTextCompare) = 0 Then
            On Error Resume Next
            Err.Clear

            Application.Run CStr(procs(i)), ctx, pressed

            If Err.Number <> 0 Then
                utilLog.LogError CStr(procs(i)), Err.Number, Err.Description
                Err.Clear
            End If

            On Error GoTo 0
            Exit Sub
        End If
    Next i
End Sub
