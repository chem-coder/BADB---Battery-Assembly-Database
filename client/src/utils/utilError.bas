Attribute VB_Name = "utilError"
Option Explicit

Public Sub RaiseAppError(ByVal procName As String, ByVal msg As String)
    Err.Raise vbObjectError + 512, procName, msg
End Sub
