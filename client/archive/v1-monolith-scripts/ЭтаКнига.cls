VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ЭтаКнига"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
' === ThisWorkbook ===
Option Explicit

' --- Константы книги ---
Private Const CHANGE_MAX_CELLS As Long = 100000

' ================= Жизненный цикл =================

Private Sub Workbook_Open()
    Dim t0 As Single
    Dim tAfterBase As Single
    Dim tAfterLogin As Single
    Dim tAfterPQ As Single

    t0 = Timer
    Debug.Print "=== Workbook_Open START ==="

    On Error GoTo ExitSub

    Application.EnableEvents = False

    ' 0) Базовые настройки Excel под работу книги
    Application.Calculation = xlCalculationAutomatic
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True

    tAfterBase = Timer
    Debug.Print "After base settings: " & Format$(tAfterBase - t0, "0.000") & " s"

    ' 1) Вход: роли / личные пароли / админ-код 098
    If Not modUserSecurity.LoginOnOpen() Then
        Debug.Print "LoginOnOpen FAILED, total: " & Format$(Timer - t0, "0.000") & " s"
        Application.DisplayAlerts = False
        ThisWorkbook.Close SaveChanges:=False
        Exit Sub
    End If

    tAfterLogin = Timer
    Debug.Print "After LoginOnOpen: " & Format$(tAfterLogin - t0, "0.000") & " s"

    Application.EnableEvents = True

    ' 2) Инициализация Power Query / хуков (если модуль modPQ есть в проекте)
    On Error Resume Next
    modPQ.InitOnOpen
    On Error GoTo 0

    tAfterPQ = Timer
    Debug.Print "After modPQ.InitOnOpen: " & _
                Format$(tAfterPQ - tAfterLogin, "0.000") & " s since Login, " & _
                "total " & Format$(tAfterPQ - t0, "0.000") & " s"

ExitSub:
    Application.EnableEvents = True
    Debug.Print "Workbook_Open EXIT, total: " & Format$(Timer - t0, "0.000") & " s"
End Sub


Private Sub Workbook_BeforeClose(Cancel As Boolean)
    On Error Resume Next
    modPQ.AutoRefreshOff
    modPQ.Reset
    On Error GoTo 0
End Sub

Private Sub Workbook_NewSheet(ByVal Sh As Object)
    On Error Resume Next
    modPQ.RehookAllSheets
    On Error GoTo 0
End Sub

Private Sub Workbook_SheetActivate(ByVal Sh As Object)
    On Error Resume Next
    modPQ.RehookAllSheets
    On Error GoTo 0
End Sub

' ================= Глобальный обработчик изменений =================

Private Sub Workbook_SheetChange(ByVal Sh As Object, ByVal Target As Range)
    Dim isEntireColumns As Boolean
    Dim isEntireRows As Boolean

    If Not Application.EnableEvents Then Exit Sub
    If Target Is Nothing Then Exit Sub

    isEntireColumns = (Target.rows.Count = Sh.rows.Count)
    isEntireRows = (Target.Columns.Count = Sh.Columns.Count)

    If Not (isEntireColumns Or isEntireRows) Then
        If Target.CountLarge > CHANGE_MAX_CELLS Then Exit Sub
    End If

    On Error Resume Next
    modAutoStageFill.HandleChange Sh, Target
    On Error GoTo 0

    On Error Resume Next
    modPickRefresh.HandleSheetChange Sh, Target
    On Error GoTo 0
End Sub

' ================= Сервис: защита структуры книги =================

Public Sub ProtectWorkbookStructure()
    ThisWorkbook.Protect Password:="234", Structure:=True, Windows:=False
End Sub

Public Sub UnprotectWorkbookStructure()
    ThisWorkbook.Unprotect Password:="234"
End Sub


