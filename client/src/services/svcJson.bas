Attribute VB_Name = "svcJson"
Option Explicit

' svcJson - Build JSON packages strictly by contract schemas
' NO UI in this module

Private Const MODULE_NAME As String = "svcJson"

' ---------------------------------------------------------------------------
' Public: Build tape_prepare.v1 JSON package
' tape Collection keys: project_id, tape_recipe_id, tape_name,
'   tape_status (optional), notes (optional),
'   actuals (Collection of Collections), steps (Collection of Collections)
' ---------------------------------------------------------------------------
Public Function BuildTapePreparePackage(ByVal ctx As AppContext, ByVal tape As Collection) As String
    If ctx Is Nothing Then
        utilError.RaiseAppError MODULE_NAME & ".BuildTapePreparePackage", "Context is required."
    End If
    If tape Is Nothing Then
        utilError.RaiseAppError MODULE_NAME & ".BuildTapePreparePackage", "Tape data is required."
    End If

    Dim submissionId As String
    submissionId = generateSubmissionId()

    Dim createdAt As String
    createdAt = Format$(Now, "yyyy-mm-dd") & "T" & Format$(Now, "hh:nn:ss") & "Z"

    Dim userName As String
    userName = ctx.UserName
    If Len(Trim$(userName)) = 0 Then userName = "user"

    Dim machine As String
    machine = getMachineName()

    ' --- payload ---
    Dim p As String
    p = "{"
    p = p & jsonNum("project_id", colVal(tape, "project_id"))
    p = p & "," & jsonNum("tape_recipe_id", colVal(tape, "tape_recipe_id"))
    p = p & "," & jsonStr("tape_name", colVal(tape, "tape_name"))

    Dim tapeStatus As String
    tapeStatus = colVal(tape, "tape_status")
    If Len(tapeStatus) = 0 Then tapeStatus = "ok"
    p = p & "," & jsonStr("tape_status", tapeStatus)

    Dim notes As String
    notes = colVal(tape, "notes")
    If Len(notes) > 0 Then
        p = p & "," & jsonStr("notes", notes)
    Else
        p = p & ",""notes"":null"
    End If

    ' actuals array
    Dim actualsCol As Collection
    Set actualsCol = Nothing
    On Error Resume Next
    Set actualsCol = tape("actuals")
    On Error GoTo 0
    p = p & ",""actuals"":" & buildActualsArray(actualsCol)

    ' steps array
    Dim stepsCol As Collection
    Set stepsCol = Nothing
    On Error Resume Next
    Set stepsCol = tape("steps")
    On Error GoTo 0
    p = p & ",""steps"":" & buildStepsArray(stepsCol)

    p = p & "}"

    ' --- envelope ---
    Dim j As String
    j = "{"
    j = j & jsonStr("contract_version", "tape_prepare.v1")
    j = j & "," & jsonStr("submission_type", "tape_prepare")
    j = j & "," & jsonStr("submission_id", submissionId)
    j = j & "," & jsonStr("created_at", createdAt)
    j = j & "," & jsonStr("user", userName)
    j = j & "," & jsonStr("machine", machine)
    j = j & "," & jsonStr("checksum", "")
    j = j & ",""payload"":" & p
    j = j & "}"

    BuildTapePreparePackage = j
End Function

' ---------------------------------------------------------------------------
' Private helpers
' ---------------------------------------------------------------------------

Private Function buildActualsArray(ByVal actuals As Collection) As String
    If actuals Is Nothing Then
        buildActualsArray = "[]"
        Exit Function
    End If
    If actuals.Count = 0 Then
        buildActualsArray = "[]"
        Exit Function
    End If

    Dim result As String
    result = "["

    Dim i As Long
    For i = 1 To actuals.Count
        Dim a As Collection
        Set a = actuals(i)

        If i > 1 Then result = result & ","
        Dim item As String
        item = "{"
        item = item & jsonNum("recipe_line_id", colVal(a, "recipe_line_id"))
        item = item & "," & jsonStr("measure_mode", colVal(a, "measure_mode"))

        Dim mode As String
        mode = colVal(a, "measure_mode")

        If mode = "mass" Then
            item = item & "," & jsonNum("actual_mass_g", colVal(a, "actual_mass_g"))
            item = item & ",""actual_volume_ml"":null"
        Else
            item = item & ",""actual_mass_g"":null"
            item = item & "," & jsonNum("actual_volume_ml", colVal(a, "actual_volume_ml"))
        End If

        item = item & "," & jsonNum("material_instance_id", colVal(a, "material_instance_id"))
        item = item & "}"

        result = result & item
    Next i

    result = result & "]"
    buildActualsArray = result
End Function

Private Function buildStepsArray(ByVal steps As Collection) As String
    If steps Is Nothing Then
        buildStepsArray = "[]"
        Exit Function
    End If
    If steps.Count = 0 Then
        buildStepsArray = "[]"
        Exit Function
    End If

    Dim result As String
    result = "["

    Dim i As Long
    For i = 1 To steps.Count
        Dim s As Collection
        Set s = steps(i)

        If i > 1 Then result = result & ","
        Dim item As String
        item = "{"
        item = item & jsonStr("operation_type", colVal(s, "operation_type"))
        item = item & "," & jsonStr("performed_by", colVal(s, "performed_by"))
        item = item & "," & jsonStr("started_at", colVal(s, "started_at"))

        Dim comments As String
        comments = colVal(s, "comments")
        If Len(comments) > 0 Then
            item = item & "," & jsonStr("comments", comments)
        Else
            item = item & ",""comments"":null"
        End If

        ' params object
        Dim params As Collection
        Set params = Nothing
        On Error Resume Next
        Set params = s("params")
        On Error GoTo 0

        item = item & ",""params"":" & buildParamsObject(params)
        item = item & "}"

        result = result & item
    Next i

    result = result & "]"
    buildStepsArray = result
End Function

Private Function buildParamsObject(ByVal params As Collection) As String
    If params Is Nothing Then
        buildParamsObject = "{}"
        Exit Function
    End If
    If params.Count = 0 Then
        buildParamsObject = "{}"
        Exit Function
    End If

    Dim result As String
    result = "{"

    ' Iterate known param keys — Collection doesn't support key enumeration,
    ' so we try each known key and skip if missing.
    Dim keys As Variant
    keys = Array("slurry_volume_ml", "dry_mixing_id", "dry_start_time", _
                 "dry_duration_min", "dry_rpm", "wet_mixing_id", "wet_start_time", _
                 "wet_duration_min", "wet_rpm", _
                 "foil_id", "coating_id", _
                 "temperature_c", "atmosphere", "target_duration_min", "other_parameters", _
                 "temp_c", "pressure_value", "pressure_units", "draw_speed_m_min", _
                 "other_params", "init_thickness_microns", "final_thickness_microns", _
                 "no_passes", "appearance")

    Dim first As Boolean
    first = True

    Dim k As Long
    For k = LBound(keys) To UBound(keys)
        Dim v As String
        v = colVal(params, CStr(keys(k)))
        If Len(v) > 0 Then
            If Not first Then result = result & ","
            first = False

            ' Determine if numeric or string
            If isNumericParam(CStr(keys(k))) Then
                result = result & jsonNum(CStr(keys(k)), v)
            Else
                result = result & jsonStr(CStr(keys(k)), v)
            End If
        End If
    Next k

    result = result & "}"
    buildParamsObject = result
End Function

Private Function isNumericParam(ByVal key As String) As Boolean
    Select Case key
        Case "slurry_volume_ml", "dry_mixing_id", "dry_duration_min", _
             "wet_mixing_id", "wet_duration_min", _
             "foil_id", "coating_id", _
             "temperature_c", "target_duration_min", _
             "temp_c", "pressure_value", "draw_speed_m_min", _
             "init_thickness_microns", "final_thickness_microns", "no_passes"
            isNumericParam = True
        Case Else
            isNumericParam = False
    End Select
End Function

Private Function jsonStr(ByVal key As String, ByVal value As String) As String
    jsonStr = """" & jsonEsc(key) & """:""" & jsonEsc(value) & """"
End Function

Private Function jsonNum(ByVal key As String, ByVal value As Variant) As String
    Dim s As String
    s = Trim$(CStr(value))
    If Len(s) = 0 Or Not IsNumeric(s) Then
        jsonNum = """" & jsonEsc(key) & """:null"
    Else
        jsonNum = """" & jsonEsc(key) & """:" & s
    End If
End Function

Private Function jsonEsc(ByVal s As String) As String
    Dim t As String
    t = s
    t = Replace(t, "\", "\\")
    t = Replace(t, """", "\""")
    t = Replace(t, vbCrLf, "\n")
    t = Replace(t, vbCr, "\n")
    t = Replace(t, vbLf, "\n")
    jsonEsc = t
End Function

Private Function colVal(ByVal col As Collection, ByVal key As String) As String
    On Error Resume Next
    colVal = CStr(col(key))
    If Err.Number <> 0 Then
        Err.Clear
        colVal = vbNullString
    End If
    On Error GoTo 0
End Function

Private Function generateSubmissionId() As String
    Randomize
    Dim n As Long
    n = CLng((Rnd() * 900000) + 100000)
    generateSubmissionId = Format$(Now, "yyyymmddhhnnss") & "_" & CStr(n)
End Function

Private Function getMachineName() As String
    On Error Resume Next
    #If Mac Then
        getMachineName = "mac"
    #Else
        getMachineName = Environ$("COMPUTERNAME")
    #End If
    If Len(getMachineName) = 0 Then getMachineName = "unknown"
    On Error GoTo 0
End Function
