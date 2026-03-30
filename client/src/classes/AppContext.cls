VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "AppContext"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Explicit

Private mUserName As String
Private mRole As String
Private mIsAuthorized As Boolean
Private mToken As String
Private mLastLoadResponse As String
Private mSelectedProjectID As String
Private mRootPath As String

Private Sub Class_Initialize()
    Reset
End Sub

Public Sub Reset()
    mUserName = vbNullString
    mRole = "Guest"
    mIsAuthorized = False
    mToken = vbNullString
    mLastLoadResponse = vbNullString
    mSelectedProjectID = vbNullString
    mRootPath = vbNullString
End Sub

Public Property Get UserName() As String
    UserName = mUserName
End Property

Public Property Let UserName(ByVal value As String)
    mUserName = value
End Property

Public Property Get Role() As String
    Role = mRole
End Property

Public Property Let Role(ByVal value As String)
    mRole = value
End Property

Public Property Get IsAuthorized() As Boolean
    IsAuthorized = mIsAuthorized
End Property

Public Property Let IsAuthorized(ByVal value As Boolean)
    mIsAuthorized = value
End Property

Public Property Get Token() As String
    Token = mToken
End Property

Public Property Let Token(ByVal value As String)
    mToken = value
End Property

Public Property Get LastLoadResponse() As String
    LastLoadResponse = mLastLoadResponse
End Property

Public Property Let LastLoadResponse(ByVal value As String)
    mLastLoadResponse = value
End Property

Public Property Get SelectedProjectID() As String
    SelectedProjectID = mSelectedProjectID
End Property

Public Property Let SelectedProjectID(ByVal value As String)
    mSelectedProjectID = value
End Property

Public Property Get RootPath() As String
    RootPath = mRootPath
End Property

Public Property Let RootPath(ByVal value As String)
    mRootPath = value
End Property
