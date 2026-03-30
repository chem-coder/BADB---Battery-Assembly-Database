VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} frmAddTape
   Caption         =   "Add Tape (tape_prepare.v1)"
   ClientHeight    =   6480
   ClientLeft      =   120
   ClientTop       =   465
   ClientWidth     =   8400
   StartUpPosition =   1  'CenterOwner
   ShowModal       =   -1  'True
   Begin {978C9E23-D4B0-11CE-BF2D-00AA003F40D0} lblProject
      Caption         =   "Project ID:"
      Height          =   360
      Left            =   360
      Top             =   360
      Width           =   1800
   End
   Begin {8BD21D10-EC42-11CE-9E0D-00AA006002F3} cboProject
      Height          =   360
      Left            =   2280
      Style           =   0
      TabIndex        =   0
      Top             =   360
      Width           =   4000
   End
   Begin {978C9E23-D4B0-11CE-BF2D-00AA003F40D0} lblRecipe
      Caption         =   "Tape Recipe ID:"
      Height          =   360
      Left            =   360
      Top             =   960
      Width           =   1800
   End
   Begin {8BD21D10-EC42-11CE-9E0D-00AA006002F3} cboRecipe
      Height          =   360
      Left            =   2280
      Style           =   0
      TabIndex        =   1
      Top             =   960
      Width           =   4000
   End
   Begin {978C9E23-D4B0-11CE-BF2D-00AA003F40D0} lblTapeName
      Caption         =   "Tape Name:"
      Height          =   360
      Left            =   360
      Top             =   1560
      Width           =   1800
   End
   Begin {8BD21D20-EC42-11CE-9E0D-00AA006002F3} txtTapeName
      Height          =   360
      Left            =   2280
      TabIndex        =   2
      Top             =   1560
      Width           =   4000
   End
   Begin {978C9E23-D4B0-11CE-BF2D-00AA003F40D0} lblStatus
      Caption         =   "Status:"
      Height          =   360
      Left            =   360
      Top             =   2160
      Width           =   1800
   End
   Begin {8BD21D10-EC42-11CE-9E0D-00AA006002F3} cboStatus
      Height          =   360
      Left            =   2280
      Style           =   2
      TabIndex        =   3
      Top             =   2160
      Width           =   2400
   End
   Begin {978C9E23-D4B0-11CE-BF2D-00AA003F40D0} lblNotes
      Caption         =   "Notes:"
      Height          =   360
      Left            =   360
      Top             =   2760
      Width           =   1800
   End
   Begin {8BD21D20-EC42-11CE-9E0D-00AA006002F3} txtNotes
      Height          =   960
      Left            =   2280
      MultiLine       =   -1  'True
      ScrollBars      =   2
      TabIndex        =   4
      Top             =   2760
      Width           =   5640
   End
   Begin {D7053240-CE69-11CD-A777-00DD01143C57} btnSubmit
      Caption         =   "Submit"
      Default         =   -1  'True
      Height          =   480
      Left            =   4200
      TabIndex        =   5
      Top             =   5520
      Width           =   1600
   End
   Begin {D7053240-CE69-11CD-A777-00DD01143C57} btnCancel
      Cancel          =   -1  'True
      Caption         =   "Cancel"
      Height          =   480
      Left            =   6120
      TabIndex        =   6
      Top             =   5520
      Width           =   1600
   End
End
Attribute VB_Name = "frmAddTape"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Explicit

Private mCtx As AppContext
Private mSubmitted As Boolean

Public Property Set Context(ByVal ctx As AppContext)
    Set mCtx = ctx
End Property

Public Property Get WasSubmitted() As Boolean
    WasSubmitted = mSubmitted
End Property

' --- Return collected data as Collection (same structure as svcJson expects) ---
Public Function GetTapeData() As Collection
    Dim tape As Collection
    Set tape = New Collection

    tape.Add Trim$(cboProject.Value), "project_id"
    tape.Add Trim$(cboRecipe.Value), "tape_recipe_id"
    tape.Add Trim$(txtTapeName.Value), "tape_name"
    tape.Add cboStatus.Value, "tape_status"
    tape.Add txtNotes.Value, "notes"

    ' MVP: empty actuals and steps (Stage B will add these)
    Dim emptyActuals As Collection
    Set emptyActuals = New Collection
    tape.Add emptyActuals, "actuals"

    Dim emptySteps As Collection
    Set emptySteps = New Collection
    tape.Add emptySteps, "steps"

    Set GetTapeData = tape
End Function

Private Sub UserForm_Initialize()
    mSubmitted = False

    ' Status dropdown
    cboStatus.AddItem "ok"
    cboStatus.AddItem "experimental"
    cboStatus.AddItem "discarded"
    cboStatus.Value = "ok"
End Sub

Private Sub btnSubmit_Click()
    ' Validate required fields
    If Len(Trim$(cboProject.Value)) = 0 Then
        MsgBox "Project ID is required.", vbExclamation, "Validation"
        cboProject.SetFocus
        Exit Sub
    End If

    If Len(Trim$(cboRecipe.Value)) = 0 Then
        MsgBox "Recipe ID is required.", vbExclamation, "Validation"
        cboRecipe.SetFocus
        Exit Sub
    End If

    If Len(Trim$(txtTapeName.Value)) = 0 Then
        MsgBox "Tape Name is required.", vbExclamation, "Validation"
        txtTapeName.SetFocus
        Exit Sub
    End If

    mSubmitted = True
    Me.Hide
End Sub

Private Sub btnCancel_Click()
    mSubmitted = False
    Me.Hide
End Sub

Private Sub UserForm_QueryClose(Cancel As Integer, CloseMode As Integer)
    If CloseMode = 0 Then ' vbFormControlMenu (X button)
        mSubmitted = False
        Me.Hide
        Cancel = True
    End If
End Sub
