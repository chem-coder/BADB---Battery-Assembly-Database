Attribute VB_Name = "svcWorkbook"
Option Explicit

Public Function Workbook_GetHostWorkbook() As Workbook
    Set Workbook_GetHostWorkbook = ThisWorkbook
End Function

Public Function Workbook_GetNamedRange(ByVal rangeName As String) As Range
    Dim wb As Workbook

    Set wb = Workbook_GetHostWorkbook()

    On Error Resume Next
    Set Workbook_GetNamedRange = wb.Names(rangeName).RefersToRange
    On Error GoTo 0
End Function

Public Function Workbook_ReadNamedValue(ByVal rangeName As String) As Variant
    Dim rng As Range

    Set rng = Workbook_GetNamedRange(rangeName)

    If rng Is Nothing Then
        Workbook_ReadNamedValue = Empty
    Else
        Workbook_ReadNamedValue = rng.Value
    End If
End Function

Public Function GetDatabaseWorkbookReadOnly(ByVal ctx As AppContext) As Workbook
    Dim wb As Workbook

    For Each wb In Application.Workbooks
        If StrComp(wb.Name, cfgApp.DB_FILE_NAME, vbTextCompare) = 0 Then
            Set GetDatabaseWorkbookReadOnly = wb
            Exit Function
        End If
    Next wb

    On Error Resume Next
    Set GetDatabaseWorkbookReadOnly = Application.Workbooks.Open( _
        Filename:=cfgApp.DB_FILE_WIN, _
        ReadOnly:=True, _
        UpdateLinks:=False, _
        AddToMru:=False)

    If Err.Number <> 0 Or GetDatabaseWorkbookReadOnly Is Nothing Then
        Dim openErr As String
        openErr = Err.Description
        Err.Clear
        On Error GoTo 0
        utilError.RaiseAppError "svcWorkbook.GetDatabaseWorkbookReadOnly", "Cannot open DB workbook: " & cfgApp.DB_FILE_WIN & " | " & openErr
        Exit Function
    End If

    On Error GoTo 0
End Function

Public Function FindTable(ByVal wb As Workbook, ByVal tableName As String) As Object
    Dim ws As Worksheet
    Dim lo As ListObject

    If wb Is Nothing Then Exit Function

    For Each ws In wb.Worksheets
        For Each lo In ws.ListObjects
            If StrComp(lo.Name, tableName, vbTextCompare) = 0 Then
                Set FindTable = lo
                Exit Function
            End If
        Next lo
    Next ws
End Function
