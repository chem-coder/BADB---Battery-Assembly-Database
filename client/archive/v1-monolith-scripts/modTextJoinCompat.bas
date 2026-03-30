Attribute VB_Name = "modTextJoinCompat"
'=== modTextJoinCompat ===
Option Explicit

' Склеивает непустые значения диапазона через разделитель (по умолчанию ", ")
Public Function JoinColumn(ByVal rng As Range, Optional ByVal delim As String = ", ") As String
    Dim c As Range, buf As String, v As Variant
    For Each c In rng.Cells
        v = c.value
        If Len(CStr(v)) > 0 Then
            If Len(buf) > 0 Then buf = buf & delim
            buf = buf & CStr(v)
        End If
    Next c
    JoinColumn = buf
End Function

