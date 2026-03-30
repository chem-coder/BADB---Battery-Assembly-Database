Attribute VB_Name = "svcLoad"
Option Explicit

' svcLoad - Load projects and references via HTTP GET
' Server: GET /api/projects?ids=1,2,3  |  GET /api/references/:type
' NO UI in this module — errors propagate to cmd* callers

Private Const MODULE_NAME As String = "svcLoad"

' ---------------------------------------------------------------------------
' Public: Load projects by IDs, store JSON response in ctx.LastLoadResponse
' ---------------------------------------------------------------------------
Public Function LoadProjects(ByVal ctx As AppContext, ByVal projectIds As String) As Boolean
    If ctx Is Nothing Then
        utilError.RaiseAppError MODULE_NAME & ".LoadProjects", "Context is required."
        Exit Function
    End If

    If Not ctx.IsAuthorized Then
        utilLog.LogError MODULE_NAME & ".LoadProjects", 0, "Not authorized"
        LoadProjects = False
        Exit Function
    End If

    If Len(Trim$(projectIds)) = 0 Then
        utilLog.LogError MODULE_NAME & ".LoadProjects", 0, "Project IDs are empty"
        LoadProjects = False
        Exit Function
    End If

    On Error GoTo ErrHandler

    Dim url As String
    url = buildProjectUrl(projectIds)

    Dim response As String
    response = svcHttp.HttpGet(url, ctx.Token)

    ctx.LastLoadResponse = response

    LoadProjects = True
    Exit Function

ErrHandler:
    utilLog.LogError MODULE_NAME & ".LoadProjects", Err.Number, Err.Description
    LoadProjects = False
End Function

' ---------------------------------------------------------------------------
' Public: Load reference data by type (materials, recipes, foils, etc.)
' ---------------------------------------------------------------------------
Public Function LoadReferences(ByVal ctx As AppContext, ByVal refType As String) As String
    If ctx Is Nothing Then
        utilError.RaiseAppError MODULE_NAME & ".LoadReferences", "Context is required."
        Exit Function
    End If

    If Not ctx.IsAuthorized Then
        utilLog.LogError MODULE_NAME & ".LoadReferences", 0, "Not authorized"
        LoadReferences = vbNullString
        Exit Function
    End If

    On Error GoTo ErrHandler

    Dim url As String
    url = cfgApp.SERVER_URL & "/api/references/" & refType

    LoadReferences = svcHttp.HttpGet(url, ctx.Token)
    Exit Function

ErrHandler:
    utilLog.LogError MODULE_NAME & ".LoadReferences", Err.Number, Err.Description
    LoadReferences = vbNullString
End Function

' ---------------------------------------------------------------------------
' Private: Build URL for /api/projects?ids=...
' ---------------------------------------------------------------------------
Private Function buildProjectUrl(ByVal ids As String) As String
    buildProjectUrl = cfgApp.SERVER_URL & "/api/projects?ids=" & ids
End Function
