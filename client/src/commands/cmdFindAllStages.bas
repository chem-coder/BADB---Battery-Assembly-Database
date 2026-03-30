Attribute VB_Name = "cmdFindAllStages"
Option Explicit

Public Sub Run(ByVal ctx As AppContext)
    If ctx Is Nothing Then
        MsgBox "Context is not set.", vbExclamation, "All Stages"
        Exit Sub
    End If

    If Not ctx.IsAuthorized Then
        MsgBox "Not authorized. Please login first.", vbExclamation, "All Stages"
        Exit Sub
    End If

    If Len(ctx.LastLoadResponse) = 0 Then
        MsgBox "No data loaded. Use Load first.", vbExclamation, "All Stages"
        Exit Sub
    End If

    Dim types As Variant
    types = Array("drying_am", "weighing", "mixing", "coating", _
                  "drying_tape", "calendering", "drying_pressed_tape")

    Dim summary As String
    summary = "Stage summary:" & vbCrLf & vbCrLf

    Dim total As Long
    total = 0

    Dim i As Long
    For i = LBound(types) To UBound(types)
        Dim search As String
        search = """operation_type"":""" & CStr(types(i)) & """"

        Dim cnt As Long
        cnt = svcSearch.CountMatches(ctx.LastLoadResponse, search)

        summary = summary & CStr(types(i)) & ": " & CStr(cnt) & vbCrLf
        total = total + cnt
    Next i

    summary = summary & vbCrLf & "Total: " & CStr(total)

    MsgBox summary, vbInformation, "All Stages"
End Sub
