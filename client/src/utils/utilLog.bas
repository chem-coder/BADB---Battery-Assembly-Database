Attribute VB_Name = "utilLog"
Option Explicit

Public Sub LogError(ByVal procName As String, ByVal errNum As Long, ByVal errDesc As String)
    Debug.Print Format$(Now, "yyyy-mm-dd hh:nn:ss") & " [ERROR] " & procName & " | " & CStr(errNum) & " | " & errDesc
End Sub
