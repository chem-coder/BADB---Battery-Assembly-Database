Attribute VB_Name = "cmdAdd"
Option Explicit

' cmdAdd - Tape data entry via UserForm (tape_prepare.v1 contract)
' Stage A: form with 5 fields (project, recipe, name, status, notes)
' Stage B (future): actuals and steps grids in the form

Public Sub Run(ByVal ctx As AppContext)
    If ctx Is Nothing Then
        MsgBox "Context is not set.", vbExclamation, "Add"
        Exit Sub
    End If

    If Not ctx.IsAuthorized Then
        MsgBox "Not authorized. Please login first.", vbExclamation, "Add"
        Exit Sub
    End If

    ' --- Show form ---
    Dim frm As frmAddTape
    Set frm = New frmAddTape
    Set frm.Context = ctx

    frm.Show vbModal

    If Not frm.WasSubmitted Then
        Unload frm
        Exit Sub
    End If

    ' --- Get data from form ---
    Dim tape As Collection
    Set tape = frm.GetTapeData()
    Unload frm

    ' --- Build JSON by contract ---
    Dim jsonText As String

    On Error Resume Next
    Err.Clear
    jsonText = svcJson.BuildTapePreparePackage(ctx, tape)

    If Err.Number <> 0 Or Len(jsonText) = 0 Then
        Dim eDesc As String
        eDesc = Err.Description
        Err.Clear
        On Error GoTo 0
        MsgBox "Failed to build package." & vbCrLf & eDesc, vbExclamation, "Add"
        Exit Sub
    End If
    On Error GoTo 0

    ' --- Submit (HTTP with file-queue fallback) ---
    Dim ok As Boolean
    ok = svcSubmit.SubmitWithFallback(ctx, jsonText)

    If ok Then
        MsgBox "Tape data submitted." & vbCrLf & _
               "Tape: " & tape("tape_name"), vbInformation, "Add"
    Else
        MsgBox "Submission failed. Check logs.", vbExclamation, "Add"
    End If
End Sub
