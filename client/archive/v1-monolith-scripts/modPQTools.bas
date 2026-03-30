Attribute VB_Name = "modPQTools"
Sub FixPQ_EnableRefresh()
    Dim cn As WorkbookConnection

    For Each cn In ThisWorkbook.Connections
        ' Подсветим только наши три ключевых запроса
        If cn.Name Like "*Список_Этапов*" _
        Or cn.Name Like "*Этапы_Объединённые*" _
        Or cn.Name Like "*Справочник_Серий_по_этапам*" Then

            On Error Resume Next
            ' Для Power Query обычно это OLEDBConnection или ODBCConnection
            If Not cn.OLEDBConnection Is Nothing Then
                cn.OLEDBConnection.EnableRefresh = True
                cn.OLEDBConnection.BackgroundQuery = False
            End If
            If Not cn.ODBCConnection Is Nothing Then
                cn.ODBCConnection.EnableRefresh = True
                cn.ODBCConnection.BackgroundQuery = False
            End If

            ' Чтобы не дёргалось при открытии файла
            cn.RefreshOnFileOpen = False
            On Error GoTo 0
        End If
    Next cn

    MsgBox "Флаги EnableRefresh для PQ-запросов восстановлены.", vbInformation
End Sub


