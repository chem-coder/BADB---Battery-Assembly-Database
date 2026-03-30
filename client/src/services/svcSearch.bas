Attribute VB_Name = "svcSearch"
Option Explicit

' svcSearch - Search loaded JSON data (ctx.LastLoadResponse)
' NO UI in this module

Private Const MODULE_NAME As String = "svcSearch"

' ---------------------------------------------------------------------------
' Public: Find first object containing "tape_id":id or "project_id":id
' Returns JSON fragment { ... } (first nesting level) or empty string
' ---------------------------------------------------------------------------
Public Function FindById(ByVal response As String, ByVal entityId As String) As String
    If Len(response) = 0 Or Len(entityId) = 0 Then
        FindById = vbNullString
        Exit Function
    End If

    ' Try "tape_id":id then "project_id":id
    Dim pos As Long
    pos = findKeyValue(response, "tape_id", entityId)
    If pos = 0 Then pos = findKeyValue(response, "project_id", entityId)
    If pos = 0 Then
        FindById = vbNullString
        Exit Function
    End If

    ' Walk back to find opening {
    Dim objStart As Long
    objStart = findObjectStart(response, pos)
    If objStart = 0 Then
        FindById = vbNullString
        Exit Function
    End If

    FindById = extractObject(response, objStart)
End Function

' ---------------------------------------------------------------------------
' Public: Find all objects containing "operation_type":"stageCode"
' Returns fragments separated by vbCrLf
' ---------------------------------------------------------------------------
Public Function FindByStage(ByVal response As String, ByVal stageCode As String) As String
    If Len(response) = 0 Or Len(stageCode) = 0 Then
        FindByStage = vbNullString
        Exit Function
    End If

    Dim search As String
    search = """operation_type"":""" & stageCode & """"

    Dim result As String
    result = vbNullString

    Dim pos As Long
    pos = InStr(1, response, search, vbBinaryCompare)

    Do While pos > 0
        Dim objStart As Long
        objStart = findObjectStart(response, pos)

        If objStart > 0 Then
            Dim fragment As String
            fragment = extractObject(response, objStart)

            If Len(fragment) > 0 Then
                If Len(result) > 0 Then result = result & vbCrLf
                result = result & fragment
            End If

            ' Move past this object to find next match
            pos = InStr(objStart + Len(fragment) + 1, response, search, vbBinaryCompare)
        Else
            ' Safety: skip past current match
            pos = InStr(pos + Len(search), response, search, vbBinaryCompare)
        End If
    Loop

    FindByStage = result
End Function

' ---------------------------------------------------------------------------
' Public: Count occurrences of searchTerm in response
' ---------------------------------------------------------------------------
Public Function CountMatches(ByVal response As String, ByVal searchTerm As String) As Long
    If Len(response) = 0 Or Len(searchTerm) = 0 Then
        CountMatches = 0
        Exit Function
    End If

    Dim count As Long
    count = 0

    Dim pos As Long
    pos = InStr(1, response, searchTerm, vbBinaryCompare)

    Do While pos > 0
        count = count + 1
        pos = InStr(pos + Len(searchTerm), response, searchTerm, vbBinaryCompare)
    Loop

    CountMatches = count
End Function

' ---------------------------------------------------------------------------
' Private helpers
' ---------------------------------------------------------------------------

Private Function extractObject(ByVal json As String, ByVal startPos As Long) As String
    If Mid$(json, startPos, 1) <> "{" Then
        extractObject = vbNullString
        Exit Function
    End If

    Dim depth As Long
    depth = 0

    Dim i As Long
    Dim ch As String

    For i = startPos To Len(json)
        ch = Mid$(json, i, 1)

        If ch = "{" Then
            depth = depth + 1
        ElseIf ch = "}" Then
            depth = depth - 1
            If depth = 0 Then
                extractObject = Mid$(json, startPos, i - startPos + 1)
                Exit Function
            End If
        ElseIf ch = """" Then
            ' Skip string contents (handle escaped quotes)
            i = skipString(json, i)
        End If
    Next i

    ' Unbalanced — return what we have
    extractObject = vbNullString
End Function

Private Function findKeyValue(ByVal json As String, ByVal key As String, ByVal value As String) As Long
    ' Search for "key":value (numeric) or "key":"value" (string)
    Dim searchNum As String
    searchNum = """" & key & """:" & value

    Dim pos As Long
    pos = InStr(1, json, searchNum, vbBinaryCompare)
    If pos > 0 Then
        ' Verify it's an exact numeric match (not a prefix of a longer number)
        Dim afterPos As Long
        afterPos = pos + Len(searchNum)
        If afterPos <= Len(json) Then
            Dim nextCh As String
            nextCh = Mid$(json, afterPos, 1)
            If nextCh >= "0" And nextCh <= "9" Then
                ' Partial match — keep searching
                pos = 0
            End If
        End If
    End If

    If pos > 0 Then
        findKeyValue = pos
        Exit Function
    End If

    ' Try string value: "key":"value"
    Dim searchStr As String
    searchStr = """" & key & """:""" & value & """"

    findKeyValue = InStr(1, json, searchStr, vbBinaryCompare)
End Function

Private Function findObjectStart(ByVal json As String, ByVal fromPos As Long) As Long
    ' Walk backwards from fromPos to find the nearest opening {
    ' that is at nesting level 0 relative to what we encounter
    Dim depth As Long
    depth = 0

    Dim i As Long
    For i = fromPos To 1 Step -1
        Dim ch As String
        ch = Mid$(json, i, 1)

        If ch = "}" Then
            depth = depth + 1
        ElseIf ch = "{" Then
            If depth = 0 Then
                findObjectStart = i
                Exit Function
            End If
            depth = depth - 1
        End If
    Next i

    findObjectStart = 0
End Function

Private Function skipString(ByVal json As String, ByVal quotePos As Long) As Long
    ' Skip from opening " to closing " (handling \" escapes)
    Dim i As Long
    i = quotePos + 1

    Do While i <= Len(json)
        Dim ch As String
        ch = Mid$(json, i, 1)

        If ch = "\" Then
            i = i + 2  ' skip escaped char
        ElseIf ch = """" Then
            skipString = i
            Exit Function
        Else
            i = i + 1
        End If
    Loop

    skipString = Len(json)
End Function
