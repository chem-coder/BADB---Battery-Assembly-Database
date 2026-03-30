Attribute VB_Name = "svcAuth"
Option Explicit

' svcAuth - Authentication via HTTP POST /api/auth
' Server response: {"token":"xxx","role":"Employee","userName":"Dima"}
' NO UI in this module — errors propagate to cmd* callers

Private Const MODULE_NAME As String = "svcAuth"

' ---------------------------------------------------------------------------
' Public: Authenticate user via server
' ---------------------------------------------------------------------------
Public Function Authenticate(ByVal ctx As AppContext, ByVal login As String, ByVal password As String) As Boolean
    If ctx Is Nothing Then
        utilError.RaiseAppError MODULE_NAME & ".Authenticate", "Context is required."
        Exit Function
    End If

    On Error GoTo ErrHandler

    Dim url As String
    url = cfgApp.SERVER_URL & "/api/auth"

    Dim response As String
    response = svcHttp.HttpAuth(url, login, password)

    Dim token As String: token = parseJsonValue(response, "token")
    Dim role As String: role = parseJsonValue(response, "role")
    Dim userName As String: userName = parseJsonValue(response, "userName")

    If Len(token) = 0 Then
        utilLog.LogError MODULE_NAME & ".Authenticate", 0, "Empty token in server response"
        Authenticate = False
        Exit Function
    End If

    ctx.Token = token
    ctx.UserName = userName
    ctx.Role = role
    ctx.IsAuthorized = True

    Authenticate = True
    Exit Function

ErrHandler:
    utilLog.LogError MODULE_NAME & ".Authenticate", Err.Number, Err.Description
    Authenticate = False
End Function

' ---------------------------------------------------------------------------
' Public: Clear session
' ---------------------------------------------------------------------------
Public Sub Auth_Clear(ByVal ctx As AppContext)
    If ctx Is Nothing Then
        utilError.RaiseAppError MODULE_NAME & ".Auth_Clear", "Context is required."
        Exit Sub
    End If

    ctx.UserName = vbNullString
    ctx.Role = cfgApp.ROLE_GUEST
    ctx.IsAuthorized = False
    ctx.Token = vbNullString
End Sub

' ---------------------------------------------------------------------------
' Private: Extract value for "key":"value" from JSON string
' Handles simple flat JSON — no nested objects or escaped quotes
' ---------------------------------------------------------------------------
Private Function parseJsonValue(ByVal json As String, ByVal key As String) As String
    Dim search As String
    search = """" & key & """:"""

    Dim pos As Long
    pos = InStr(1, json, search, vbBinaryCompare)
    If pos = 0 Then
        parseJsonValue = vbNullString
        Exit Function
    End If

    Dim startPos As Long
    startPos = pos + Len(search)

    Dim endPos As Long
    endPos = InStr(startPos, json, """", vbBinaryCompare)
    If endPos = 0 Then
        parseJsonValue = vbNullString
        Exit Function
    End If

    parseJsonValue = Mid$(json, startPos, endPos - startPos)
End Function
