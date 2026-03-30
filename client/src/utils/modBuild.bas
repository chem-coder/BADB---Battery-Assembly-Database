Attribute VB_Name = "modBuild"
Option Explicit

' modBuild - Export/Import/Build
' Source of truth: ROOT/src
' Dev workbook: ROOT/excel/Dev_Build.xlsm
'
' Notes:
' - Import order is important: classes first, then forms, then standard modules.
' - After import, components are renamed to match file base names.
' - No banned keywords in this file (lint-safe).

' --- ROOT PATHS (adjust if needed) ---
Public Const PROJECT_ROOT_WIN As String = "\\Mac\Home\Desktop\DB"
Public Const PROJECT_ROOT_MAC As String = "/Users/i_dmitri_i/Desktop/DB"
Public Const PROJECT_ROOT_MAC_HFS As String = "Macintosh HD:Users:i_dmitri_i:Desktop:DB"

' Keep this module during import
Public Const BUILD_MODULE_NAME As String = "modBuild"

' --- PROJECT DIRS ---
Private Const DIR_SRC As String = "src"
Private Const DIR_MODULES As String = "modules"
Private Const DIR_CLASSES As String = "classes"
Private Const DIR_FORMS As String = "forms"
Private Const DIR_DIST As String = "dist"
Private Const DIR_EXCEL As String = "excel"

' --- ADDIN TEMPLATE ---
Private Const TEMPLATE_ADDIN_NAME As String = "TemplateAddin.xlam"
Private Const OUT_ADDIN_NAME As String = "DatabaseUI.xlam"

' VBIDE component types (late-bound)
Private Const VBEXT_CT_STDMODULE As Long = 1
Private Const VBEXT_CT_CLASSMODULE As Long = 2
Private Const VBEXT_CT_MSFORM As Long = 3
Private Const VBEXT_CT_DOCUMENT As Long = 100

' ==========================
' PUBLIC COMMANDS
' ==========================

Public Sub Build_ShowRootPath()
    MsgBox "Project root:" & vbCrLf & Build_GetProjectRoot(), vbInformation, "Build"
End Sub

Public Sub Build_Export_All_From_ThisWorkbook()
    Call Build_Export_Project(ThisWorkbook)
End Sub

Public Sub Build_Import_All_Into_ThisWorkbook()
    Call Build_Import_Project(ThisWorkbook)
End Sub

Public Sub Build_Make_Addin()
    Dim root As String
    Dim sep As String
    Dim distPath As String
    Dim templatePath As String
    Dim outAddin As String
    Dim wbAddin As Workbook
    Dim ok As Boolean

    If Not Build_CanAccessVBProject() Then Exit Sub

    root = Build_GetProjectRoot()
    sep = Build_DetectSep(root)

    distPath = Build_Combine(root, DIR_DIST, sep)
    templatePath = Build_Combine(Build_Combine(root, DIR_EXCEL, sep), TEMPLATE_ADDIN_NAME, sep)

    Call Build_EnsureFolder(distPath)

    outAddin = Build_Combine(distPath, OUT_ADDIN_NAME, sep)

    Call Build_CloseWorkbookIfOpen(outAddin)

    If Build_FileExists(templatePath) Then
        Call Build_SafeDeleteFile(outAddin)
        FileCopy templatePath, outAddin

        Set wbAddin = Workbooks.Open(outAddin, ReadOnly:=False)
        If wbAddin Is Nothing Then
            MsgBox "Failed to open add-in: " & outAddin, vbExclamation, "Build"
            Exit Sub
        End If
    Else
        Set wbAddin = Workbooks.Add(xlWBATWorksheet)
        If wbAddin Is Nothing Then
            MsgBox "Failed to create workbook for add-in.", vbExclamation, "Build"
            Exit Sub
        End If

        wbAddin.IsAddin = True
        Call Build_SafeDeleteFile(outAddin)
        wbAddin.SaveAs fileName:=outAddin, FileFormat:=xlOpenXMLAddIn
    End If

    ok = Build_Import_Project(wbAddin)
    If Not ok Then
        MsgBox "Build aborted: import failed.", vbExclamation, "Build"
        On Error Resume Next
        wbAddin.Close SaveChanges:=False
        On Error GoTo 0
        Exit Sub
    End If

    wbAddin.Save
    wbAddin.Close SaveChanges:=True

    MsgBox "Done: " & outAddin, vbInformation, "Build"
End Sub

' ==========================
' EXPORT / IMPORT
' ==========================

Private Function Build_Export_Project(ByVal wb As Workbook) As Boolean
    Dim root As String
    Dim sep As String
    Dim pSrc As String, pModules As String, pClasses As String, pForms As String
    Dim vbproj As Object
    Dim vbcomps As Object
    Dim comp As Object
    Dim cType As Long
    Dim compName As String
    Dim outFile As String

    Build_Export_Project = False
    If Not Build_CanAccessVBProject() Then Exit Function

    root = Build_GetProjectRoot()
    sep = Build_DetectSep(root)

    pSrc = Build_Combine(root, DIR_SRC, sep)
    pModules = Build_Combine(pSrc, DIR_MODULES, sep)
    pClasses = Build_Combine(pSrc, DIR_CLASSES, sep)
    pForms = Build_Combine(pSrc, DIR_FORMS, sep)

    Call Build_EnsureFolder(pSrc)
    Call Build_EnsureFolder(pModules)
    Call Build_EnsureFolder(pClasses)
    Call Build_EnsureFolder(pForms)

    Set vbproj = Build_GetVBProject(wb)
    If vbproj Is Nothing Then
        MsgBox "VBProject is not accessible. Enable Trust access.", vbExclamation, "Build"
        Exit Function
    End If

    Set vbcomps = vbproj.VBComponents
    If vbcomps Is Nothing Then
        MsgBox "VBComponents is not accessible.", vbExclamation, "Build"
        Exit Function
    End If

    For Each comp In vbcomps
        cType = CLng(comp.Type)
        compName = CStr(comp.Name)

        If cType = VBEXT_CT_STDMODULE Then
            outFile = Build_Combine(pModules, compName & ".bas", sep)
            If Not Build_TryExport(comp, outFile) Then Exit Function

        ElseIf cType = VBEXT_CT_CLASSMODULE Then
            outFile = Build_Combine(pClasses, compName & ".cls", sep)
            If Not Build_TryExport(comp, outFile) Then Exit Function

        ElseIf cType = VBEXT_CT_MSFORM Then
            outFile = Build_Combine(pForms, compName & ".frm", sep)
            If Not Build_TryExport(comp, outFile) Then Exit Function
        End If
    Next comp

    Build_Export_Project = True
    MsgBox "Export completed:" & vbCrLf & pSrc, vbInformation, "Build"
End Function

Private Function Build_Import_Project(ByVal wb As Workbook) As Boolean
    Dim root As String
    Dim sep As String
    Dim pSrc As String, pModules As String, pClasses As String, pForms As String
    Dim vbproj As Object
    Dim vbcomps As Object
    Dim keep As Variant

    Build_Import_Project = False
    If Not Build_CanAccessVBProject() Then Exit Function

    root = Build_GetProjectRoot()
    sep = Build_DetectSep(root)

    pSrc = Build_Combine(root, DIR_SRC, sep)
    pModules = Build_Combine(pSrc, DIR_MODULES, sep)
    pClasses = Build_Combine(pSrc, DIR_CLASSES, sep)
    pForms = Build_Combine(pSrc, DIR_FORMS, sep)

    If Not Build_FolderExists(pModules) And Not Build_FolderExists(pClasses) And Not Build_FolderExists(pForms) Then
        MsgBox "src folders not found. Export first.", vbExclamation, "Build"
        Exit Function
    End If

    If Not Build_CheckNoDuplicateBaseNames(pModules, pClasses, pForms) Then
        MsgBox "Import aborted: duplicate file base names found across src folders.", vbExclamation, "Build"
        Exit Function
    End If

    Set vbproj = Build_GetVBProject(wb)
    If vbproj Is Nothing Then
        MsgBox "VBProject is not accessible. Enable Trust access.", vbExclamation, "Build"
        Exit Function
    End If

    Set vbcomps = vbproj.VBComponents
    If vbcomps Is Nothing Then
        MsgBox "VBComponents is not accessible.", vbExclamation, "Build"
        Exit Function
    End If

    keep = KEEP_COMPONENTS()

    If Not Build_RemoveComponents(vbproj, keep) Then Exit Function

    ' Important: classes first
    If Not Build_ImportFromFolder(vbproj, pClasses, "*.cls", keep) Then Exit Function
    If Not Build_EnsureClassExists(vbproj, "AppContext") Then Exit Function

    If Not Build_ImportFromFolder(vbproj, pForms, "*.frm", keep) Then Exit Function
    If Not Build_ImportFromFolder(vbproj, pModules, "*.bas", keep) Then Exit Function

    Build_Import_Project = True
    MsgBox "Import completed.", vbInformation, "Build"
End Function

' ==========================
' KEEP LIST
' ==========================

Private Function KEEP_COMPONENTS() As Variant
    KEEP_COMPONENTS = Array(BUILD_MODULE_NAME)
End Function

' ==========================
' HELPERS
' ==========================

Private Function Build_CanAccessVBProject() As Boolean
    Dim vbeObj As Object
    Build_CanAccessVBProject = False

    On Error Resume Next
    Set vbeObj = Application.VBE
    If Err.Number <> 0 Then
        Err.Clear
        MsgBox "Application.VBE is not accessible. Enable Trust access.", vbExclamation, "Build"
        Exit Function
    End If
    On Error GoTo 0

    If vbeObj Is Nothing Then
        MsgBox "Application.VBE is not accessible. Enable Trust access.", vbExclamation, "Build"
        Exit Function
    End If

    Build_CanAccessVBProject = True
End Function

Private Function Build_GetVBProject(ByVal wb As Workbook) As Object
    Dim vbproj As Object
    Set vbproj = Nothing
    On Error Resume Next
    Set vbproj = wb.VBProject
    On Error GoTo 0
    Set Build_GetVBProject = vbproj
End Function

Private Function Build_RemoveComponents(ByVal vbproj As Object, ByVal keep As Variant) As Boolean
    Dim vbcomps As Object
    Dim comp As Object
    Dim toRemove As Collection
    Dim cType As Long
    Dim compName As String
    Dim i As Long

    Build_RemoveComponents = False
    Set vbcomps = vbproj.VBComponents
    If vbcomps Is Nothing Then Exit Function

    Set toRemove = New Collection

    For Each comp In vbcomps
        cType = CLng(comp.Type)
        compName = CStr(comp.Name)

        If cType = VBEXT_CT_STDMODULE Or cType = VBEXT_CT_CLASSMODULE Or cType = VBEXT_CT_MSFORM Then
            If Not Build_InArray(compName, keep) Then
                toRemove.Add comp
            End If
        End If
    Next comp

    For i = toRemove.Count To 1 Step -1
        Set comp = toRemove(i)
        On Error Resume Next
        vbproj.VBComponents.Remove comp
        If Err.Number <> 0 Then
            MsgBox "Failed to remove component: " & comp.Name & vbCrLf & Err.Description, vbExclamation, "Build"
            Err.Clear
            Exit Function
        End If
        On Error GoTo 0
    Next i

    Build_RemoveComponents = True
End Function

Private Function Build_ImportFromFolder(ByVal vbproj As Object, ByVal folderPath As String, ByVal mask As String, ByVal keep As Variant) As Boolean
    Dim sep As String
    Dim f As String
    Dim fullPath As String
    Dim baseName As String
    Dim newComp As Object

    Build_ImportFromFolder = True
    If Not Build_FolderExists(folderPath) Then Exit Function

    sep = Build_DetectSep(folderPath)
    f = Dir(Build_Combine(folderPath, mask, sep))

    Do While Len(f) > 0
        baseName = Build_FileBaseName(f)

        If Not Build_InArray(baseName, keep) Then
            fullPath = Build_Combine(folderPath, f, sep)

            On Error Resume Next
            Set newComp = vbproj.VBComponents.Import(fullPath)
            If Err.Number <> 0 Then
                MsgBox "Failed to import: " & fullPath & vbCrLf & Err.Description, vbExclamation, "Build"
                Err.Clear
                Build_ImportFromFolder = False
                Exit Function
            End If
            On Error GoTo 0

            If Not newComp Is Nothing Then
                Call Build_TryRenameComponent(newComp, baseName)
            End If
        End If

        f = Dir()
    Loop
End Function

Private Function Build_EnsureClassExists(ByVal vbproj As Object, ByVal className As String) As Boolean
    Dim vbcomps As Object
    Dim comp As Object

    Build_EnsureClassExists = False
    Set vbcomps = vbproj.VBComponents
    If vbcomps Is Nothing Then Exit Function

    For Each comp In vbcomps
        If StrComp(CStr(comp.Name), className, vbTextCompare) = 0 Then
            If CLng(comp.Type) <> VBEXT_CT_CLASSMODULE Then
                MsgBox className & " exists but is not a class module. Check src/classes and name conflicts.", vbExclamation, "Build"
                Exit Function
            End If
            Build_EnsureClassExists = True
            Exit Function
        End If
    Next comp

    MsgBox "Missing class module: " & className & ". Import failed or src/classes is wrong.", vbExclamation, "Build"
End Function

Private Sub Build_TryRenameComponent(ByVal comp As Object, ByVal desiredName As String)
    If comp Is Nothing Then Exit Sub
    If Len(desiredName) = 0 Then Exit Sub
    On Error Resume Next
    comp.Name = desiredName
    On Error GoTo 0
End Sub

Private Function Build_TryExport(ByVal comp As Object, ByVal outFile As String) As Boolean
    Build_TryExport = False

    Call Build_EnsureFolder(Build_ParentFolder(outFile, Build_DetectSep(outFile)))
    Call Build_SafeDeleteFile(outFile)

    On Error Resume Next
    comp.Export outFile
    If Err.Number <> 0 Then
        MsgBox "Failed to export: " & comp.Name & vbCrLf & outFile & vbCrLf & Err.Description, vbExclamation, "Build"
        Err.Clear
        Exit Function
    End If
    On Error GoTo 0

    Build_TryExport = True
End Function

Private Function Build_GetProjectRoot() As String
    Dim os As String
    Dim root As String
    Dim wbPath As String
    Dim sep As String
    Dim tail As String

    os = Application.OperatingSystem
    root = vbNullString

    If InStr(1, os, "Mac", vbTextCompare) > 0 Then
        If Build_FolderExists(PROJECT_ROOT_MAC) Then
            root = PROJECT_ROOT_MAC
        ElseIf Build_FolderExists(PROJECT_ROOT_MAC_HFS) Then
            root = PROJECT_ROOT_MAC_HFS
        End If
    Else
        If Build_FolderExists(PROJECT_ROOT_WIN) Then
            root = PROJECT_ROOT_WIN
        End If
    End If

    If Len(root) > 0 Then
        Build_GetProjectRoot = root
        Exit Function
    End If

    wbPath = ThisWorkbook.Path
    If Len(wbPath) = 0 Then wbPath = CurDir$

    sep = Build_DetectSep(wbPath)
    tail = sep & DIR_EXCEL

    If LCase$(Right$(wbPath, Len(tail))) = LCase$(tail) Then
        wbPath = Build_ParentFolder(wbPath, sep)
    End If

    Build_GetProjectRoot = wbPath
End Function

Private Function Build_DetectSep(ByVal path As String) As String
    If InStr(1, path, "\", vbBinaryCompare) > 0 Then
        Build_DetectSep = "\"
    ElseIf InStr(1, path, ":", vbBinaryCompare) > 0 And InStr(1, path, "/", vbBinaryCompare) = 0 Then
        Build_DetectSep = ":"
    Else
        Build_DetectSep = "/"
    End If
End Function

Private Function Build_Combine(ByVal basePath As String, ByVal part As String, ByVal sep As String) As String
    Dim a As String, b As String
    a = basePath
    b = part

    If Right$(a, 1) = sep Then
        If Left$(b, 1) = sep Then
            Build_Combine = a & Mid$(b, 2)
        Else
            Build_Combine = a & b
        End If
    Else
        If Left$(b, 1) = sep Then
            Build_Combine = a & b
        Else
            Build_Combine = a & sep & b
        End If
    End If
End Function

Private Function Build_ParentFolder(ByVal fullPath As String, ByVal sep As String) As String
    Dim i As Long
    i = InStrRev(fullPath, sep)
    If i <= 0 Then
        Build_ParentFolder = vbNullString
    Else
        Build_ParentFolder = Left$(fullPath, i - 1)
    End If
End Function

Private Sub Build_EnsureFolder(ByVal folderPath As String)
    Dim sep As String
    Dim parts() As String
    Dim cur As String
    Dim i As Long
    Dim startIdx As Long
    Dim part As String

    If Len(folderPath) = 0 Then Exit Sub
    If Build_FolderExists(folderPath) Then Exit Sub

    sep = Build_DetectSep(folderPath)
    parts = Split(folderPath, sep)

    cur = vbNullString
    startIdx = 0

    If sep = "\" And Left$(folderPath, 2) = "\\" Then
        If UBound(parts) < 3 Then Exit Sub
        cur = "\\" & parts(2) & "\" & parts(3)
        startIdx = 4
    ElseIf sep = "/" And Left$(folderPath, 1) = "/" Then
        cur = "/"
        startIdx = 1
    ElseIf sep = ":" Then
        cur = parts(0) & ":"
        startIdx = 1
    Else
        cur = parts(0)
        startIdx = 1
    End If

    If Len(cur) > 0 Then
        If Not Build_FolderExists(cur) Then
            On Error Resume Next
            MkDir cur
            On Error GoTo 0
        End If
    End If

    For i = startIdx To UBound(parts)
        part = parts(i)
        If Len(part) > 0 Then
            If cur = "/" Then
                cur = cur & part
            ElseIf Right$(cur, 1) = sep Then
                cur = cur & part
            Else
                cur = cur & sep & part
            End If

            If Not Build_FolderExists(cur) Then
                On Error Resume Next
                MkDir cur
                On Error GoTo 0
            End If
        End If
    Next i
End Sub

Private Function Build_FolderExists(ByVal folderPath As String) As Boolean
    Dim s As String
    On Error Resume Next
    s = Dir(folderPath, vbDirectory)
    On Error GoTo 0
    Build_FolderExists = (Len(s) > 0)
End Function

Private Function Build_FileExists(ByVal filePath As String) As Boolean
    Dim s As String
    On Error Resume Next
    s = Dir(filePath)
    On Error GoTo 0
    Build_FileExists = (Len(s) > 0)
End Function

Private Sub Build_SafeDeleteFile(ByVal filePath As String)
    If Len(filePath) = 0 Then Exit Sub
    If Not Build_FileExists(filePath) Then Exit Sub
    On Error Resume Next
    Kill filePath
    On Error GoTo 0
End Sub

Private Sub Build_CloseWorkbookIfOpen(ByVal fullPath As String)
    Dim wb As Workbook
    For Each wb In Application.Workbooks
        If StrComp(wb.FullName, fullPath, vbTextCompare) = 0 Then
            On Error Resume Next
            wb.Close SaveChanges:=False
            On Error GoTo 0
            Exit Sub
        End If
    Next wb
End Sub

Private Function Build_FileBaseName(ByVal fileName As String) As String
    Dim p As Long
    p = InStrRev(fileName, ".")
    If p > 1 Then
        Build_FileBaseName = Left$(fileName, p - 1)
    Else
        Build_FileBaseName = fileName
    End If
End Function

Private Function Build_InArray(ByVal value As String, ByVal arr As Variant) As Boolean
    Dim i As Long
    For i = LBound(arr) To UBound(arr)
        If StrComp(CStr(arr(i)), value, vbTextCompare) = 0 Then
            Build_InArray = True
            Exit Function
        End If
    Next i
    Build_InArray = False
End Function

Private Function Build_CheckNoDuplicateBaseNames(ByVal pModules As String, ByVal pClasses As String, ByVal pForms As String) As Boolean
    Dim dict As Object
    Dim ok As Boolean

    ok = True
    Set dict = CreateObject("Scripting.Dictionary")

    If Build_FolderExists(pModules) Then
        If Not Build_AddBaseNames(dict, pModules, "*.bas") Then ok = False
    End If

    If Build_FolderExists(pClasses) Then
        If Not Build_AddBaseNames(dict, pClasses, "*.cls") Then ok = False
    End If

    If Build_FolderExists(pForms) Then
        If Not Build_AddBaseNames(dict, pForms, "*.frm") Then ok = False
    End If

    Build_CheckNoDuplicateBaseNames = ok
End Function

Private Function Build_AddBaseNames(ByVal dict As Object, ByVal folderPath As String, ByVal mask As String) As Boolean
    Dim sep As String
    Dim f As String
    Dim baseName As String
    Dim key As String

    Build_AddBaseNames = True
    If dict Is Nothing Then Exit Function

    sep = Build_DetectSep(folderPath)
    f = Dir(Build_Combine(folderPath, mask, sep))

    Do While Len(f) > 0
        baseName = Build_FileBaseName(f)
        key = UCase$(baseName)

        If dict.Exists(key) Then
            Debug.Print "Duplicate base name: " & baseName & " (" & CStr(dict.Item(key)) & " and " & folderPath & ")"
            Build_AddBaseNames = False
            Exit Function
        End If

        dict.Add key, folderPath
        f = Dir()
    Loop
End Function
