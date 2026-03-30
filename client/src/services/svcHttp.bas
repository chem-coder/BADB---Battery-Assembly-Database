Attribute VB_Name = "svcHttp"
Option Explicit

' svcHttp - HTTP client for BADB server communication (GET/POST/Auth)
' Uses MSXML2.ServerXMLHTTP.6.0 on Windows (supports timeouts)
' Mac: raises error (HTTP not available)
' NO UI in this module — errors propagate to cmd* callers

Private Const MODULE_NAME As String = "svcHttp"
Private Const TIMEOUT_MS As Long = 30000

' Error sub-codes (included in error description)
Private Const ERR_TIMEOUT As Long = 1001
Private Const ERR_NETWORK As Long = 1002
Private Const ERR_SERVER As Long = 1003

' ---------------------------------------------------------------------------
' Public: GET with Bearer token
' ---------------------------------------------------------------------------
Public Function HttpGet(ByVal url As String, ByVal token As String) As String
#If Mac Then
    Err.Raise vbObjectError + 512, MODULE_NAME & ".HttpGet", _
              "[" & ERR_NETWORK & "] HTTP not supported on Mac"
#Else
    Dim xhr As Object
    Set xhr = createRequest()

    On Error GoTo ErrHandler
    xhr.Open "GET", url, False
    setAuthHeader xhr, token
    xhr.send

    If Not IsHttpOk(xhr.Status) Then
        utilLog.LogError MODULE_NAME & ".HttpGet", ERR_SERVER, _
                         "HTTP " & xhr.Status & " " & xhr.statusText & " | " & url
        Err.Raise vbObjectError + 512, MODULE_NAME & ".HttpGet", _
                  "[" & ERR_SERVER & "] Server returned HTTP " & xhr.Status & " for " & url
    End If

    HttpGet = xhr.responseText
    Exit Function

ErrHandler:
    Dim errNum As Long: errNum = Err.Number
    Dim errDesc As String: errDesc = Err.Description

    If InStr(1, errDesc, "[" & ERR_SERVER & "]", vbTextCompare) > 0 Then
        Err.Raise errNum, Err.Source, errDesc
    End If

    utilLog.LogError MODULE_NAME & ".HttpGet", ERR_NETWORK, errDesc & " | " & url
    Err.Raise vbObjectError + 512, MODULE_NAME & ".HttpGet", _
              "[" & ERR_NETWORK & "] " & errDesc & " | " & url
#End If
End Function

' ---------------------------------------------------------------------------
' Public: POST application/json with Bearer token
' ---------------------------------------------------------------------------
Public Function HttpPost(ByVal url As String, ByVal body As String, ByVal token As String) As String
#If Mac Then
    Err.Raise vbObjectError + 512, MODULE_NAME & ".HttpPost", _
              "[" & ERR_NETWORK & "] HTTP not supported on Mac"
#Else
    Dim xhr As Object
    Set xhr = createRequest()

    On Error GoTo ErrHandler
    xhr.Open "POST", url, False
    setAuthHeader xhr, token
    xhr.setRequestHeader "Content-Type", "application/json"
    xhr.send body

    If Not IsHttpOk(xhr.Status) Then
        utilLog.LogError MODULE_NAME & ".HttpPost", ERR_SERVER, _
                         "HTTP " & xhr.Status & " " & xhr.statusText & " | " & url
        Err.Raise vbObjectError + 512, MODULE_NAME & ".HttpPost", _
                  "[" & ERR_SERVER & "] Server returned HTTP " & xhr.Status & " for " & url
    End If

    HttpPost = xhr.responseText
    Exit Function

ErrHandler:
    Dim errNum As Long: errNum = Err.Number
    Dim errDesc As String: errDesc = Err.Description

    If InStr(1, errDesc, "[" & ERR_SERVER & "]", vbTextCompare) > 0 Then
        Err.Raise errNum, Err.Source, errDesc
    End If

    utilLog.LogError MODULE_NAME & ".HttpPost", ERR_NETWORK, errDesc & " | " & url
    Err.Raise vbObjectError + 512, MODULE_NAME & ".HttpPost", _
              "[" & ERR_NETWORK & "] " & errDesc & " | " & url
#End If
End Function

' ---------------------------------------------------------------------------
' Public: POST for /api/auth (no Bearer token)
' ---------------------------------------------------------------------------
Public Function HttpAuth(ByVal url As String, ByVal login As String, ByVal password As String) As String
#If Mac Then
    Err.Raise vbObjectError + 512, MODULE_NAME & ".HttpAuth", _
              "[" & ERR_NETWORK & "] HTTP not supported on Mac"
#Else
    Dim xhr As Object
    Set xhr = createRequest()

    Dim body As String
    body = "{""login"":""" & login & """,""password"":""" & password & """}"

    On Error GoTo ErrHandler
    xhr.Open "POST", url, False
    xhr.setRequestHeader "Content-Type", "application/json"
    xhr.send body

    If Not IsHttpOk(xhr.Status) Then
        utilLog.LogError MODULE_NAME & ".HttpAuth", ERR_SERVER, _
                         "HTTP " & xhr.Status & " " & xhr.statusText & " | " & url
        Err.Raise vbObjectError + 512, MODULE_NAME & ".HttpAuth", _
                  "[" & ERR_SERVER & "] Server returned HTTP " & xhr.Status & " for " & url
    End If

    HttpAuth = xhr.responseText
    Exit Function

ErrHandler:
    Dim errNum As Long: errNum = Err.Number
    Dim errDesc As String: errDesc = Err.Description

    If InStr(1, errDesc, "[" & ERR_SERVER & "]", vbTextCompare) > 0 Then
        Err.Raise errNum, Err.Source, errDesc
    End If

    utilLog.LogError MODULE_NAME & ".HttpAuth", ERR_NETWORK, errDesc & " | " & url
    Err.Raise vbObjectError + 512, MODULE_NAME & ".HttpAuth", _
              "[" & ERR_NETWORK & "] " & errDesc & " | " & url
#End If
End Function

' ---------------------------------------------------------------------------
' Public: Check if status code is success (200-299)
' ---------------------------------------------------------------------------
Public Function IsHttpOk(ByVal statusCode As Long) As Boolean
    IsHttpOk = (statusCode >= 200 And statusCode <= 299)
End Function

' ---------------------------------------------------------------------------
' Private: Create XMLHTTP object with timeouts
' ---------------------------------------------------------------------------
Private Function createRequest() As Object
    Set createRequest = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    ' setTimeouts(resolveTimeout, connectTimeout, sendTimeout, receiveTimeout) in ms
    createRequest.setTimeouts TIMEOUT_MS, TIMEOUT_MS, TIMEOUT_MS, TIMEOUT_MS
End Function

' ---------------------------------------------------------------------------
' Private: Set Authorization: Bearer header
' ---------------------------------------------------------------------------
Private Sub setAuthHeader(ByVal xhr As Object, ByVal token As String)
    If Len(token) > 0 Then
        xhr.setRequestHeader "Authorization", "Bearer " & token
    End If
End Sub
