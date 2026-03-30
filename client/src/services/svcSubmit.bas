Attribute VB_Name = "svcSubmit"
Option Explicit

' svcSubmit - Submit JSON packages to server via HTTP POST
' Fallback: file queue via svcPackages
' NO UI in this module — errors propagate to cmd* callers

Private Const MODULE_NAME As String = "svcSubmit"

' ---------------------------------------------------------------------------
' Public: Submit JSON package to server via HTTP POST /api/submit
' ---------------------------------------------------------------------------
Public Function SubmitPackage(ByVal ctx As AppContext, ByVal jsonPayload As String) As Boolean
    If ctx Is Nothing Then
        utilError.RaiseAppError MODULE_NAME & ".SubmitPackage", "Context is required."
        Exit Function
    End If

    If Not ctx.IsAuthorized Then
        utilLog.LogError MODULE_NAME & ".SubmitPackage", 0, "Not authorized"
        SubmitPackage = False
        Exit Function
    End If

    On Error GoTo ErrHandler

    Dim url As String
    url = cfgApp.SERVER_URL & cfgApp.API_SUBMIT

    Dim response As String
    response = svcHttp.HttpPost(url, jsonPayload, ctx.Token)

    utilLog.LogError MODULE_NAME & ".SubmitPackage", 0, _
                     "Submitted OK | " & Len(jsonPayload) & " chars | response: " & Left$(response, 200)

    SubmitPackage = True
    Exit Function

ErrHandler:
    utilLog.LogError MODULE_NAME & ".SubmitPackage", Err.Number, Err.Description
    SubmitPackage = False
End Function

' ---------------------------------------------------------------------------
' Public: Submit via HTTP, fallback to file queue on failure
' ---------------------------------------------------------------------------
Public Function SubmitWithFallback(ByVal ctx As AppContext, ByVal jsonPayload As String) As Boolean
    If SubmitPackage(ctx, jsonPayload) Then
        SubmitWithFallback = True
        Exit Function
    End If

    ' HTTP failed — fallback to file queue
    On Error GoTo ErrFallback

    Dim outPath As String
    outPath = svcPackages.Packages_WriteJson(ctx, "Submit", jsonPayload)

    utilLog.LogError MODULE_NAME & ".SubmitWithFallback", 0, _
                     "HTTP failed, saved to file queue: " & outPath

    SubmitWithFallback = True
    Exit Function

ErrFallback:
    utilLog.LogError MODULE_NAME & ".SubmitWithFallback", Err.Number, _
                     "Fallback also failed: " & Err.Description
    SubmitWithFallback = False
End Function
