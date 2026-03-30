Attribute VB_Name = "modWiring"
' ===== modWiring.bas =====
Option Explicit

' 1) Универсально вычистить префикс 'Книга'! у всех кнопок/фигур
Public Sub NormalizeAssignedMacros()
    Dim ws As Worksheet, shp As Shape
    Dim oldA As String, newA As String, fixed As Long
    For Each ws In ThisWorkbook.Worksheets
        For Each shp In ws.Shapes
            On Error Resume Next
            oldA = shp.OnAction
            On Error GoTo 0
            If Len(oldA) > 0 Then
                newA = StripWBPrefix(oldA)
                If newA <> oldA Then
                    On Error Resume Next
                    shp.OnAction = newA
                    On Error GoTo 0
                    fixed = fixed + 1
                End If
            End If
        Next shp
    Next ws
    MsgBox "Привязки обновлены: " & fixed, vbInformation
End Sub

Private Function StripWBPrefix(ByVal s As String) As String
    Dim p As Long
    s = Trim$(s)
    
    StripWBPrefix = s
    If Len(s) = 0 Then Exit Function
    ' вариант: 'Книга.xlsm'!Процедура
    If Left$(s, 1) = "'" Then
        p = InStr(2, s, "'!")
        If p > 0 Then
            StripWBPrefix = Mid$(s, p + 2)
            Exit Function
        End If
    End If
    ' вариант: Книга.xlsm!Процедура
    p = InStr(s, "!")
    If p > 0 Then StripWBPrefix = Mid$(s, p + 1)
End Function

' 2) Опционально: явная привязка по именам фигур
'   Переименуй фигуры в "btnОткрытьРедактор" и "btnСохранитьШаблон"
Public Sub BindEditorButtons()
    BindShapeOnAction "btnОткрытьРедактор", "Открыть_Редактор_Создания_Шаблона"
    BindShapeOnAction "btnСохранитьШаблон", "Сохранить_Шаблон"
End Sub

Private Sub BindShapeOnAction(ByVal shapeName As String, ByVal macroName As String)
    Dim ws As Worksheet, shp As Shape
    For Each ws In ThisWorkbook.Worksheets
        On Error Resume Next
        Set shp = ws.Shapes(shapeName)
        If Not shp Is Nothing Then shp.OnAction = macroName
        Set shp = Nothing
        On Error GoTo 0
    Next ws
End Sub

' 3) Отладка: список фигур с OnAction
Public Sub ListShapesWithActions()
    Dim ws As Worksheet, shp As Shape, out As String
    For Each ws In ThisWorkbook.Worksheets
        For Each shp In ws.Shapes
            On Error Resume Next
            If Len(shp.OnAction) > 0 Then out = out & ws.Name & " :: " & shp.Name & " -> " & shp.OnAction & vbCrLf
            On Error GoTo 0
        Next shp
    Next ws
    If Len(out) = 0 Then out = "(нет привязок)"
    MsgBox out, vbInformation, "OnAction"
End Sub
