Attribute VB_Name = "cfgApp"
Option Explicit

Public Const APP_TITLE As String = "DatabaseUI"

Public Const CMD_LOGIN As String = "Login"
Public Const CMD_LOAD As String = "Load"
Public Const CMD_SYNC As String = "Sync"
Public Const CMD_SHARE As String = "Share"
Public Const CMD_ADD As String = "Add"
Public Const CMD_FIND_ID As String = "FindID"
Public Const CMD_FIND_ALL_STAGES As String = "FindAllStages"
Public Const CMD_FIND_STAGE As String = "FindStage"
Public Const CMD_NEW_TEMPLATE As String = "NewTemplate"
Public Const CMD_CHARTS_TOGGLE As String = "ChartsToggle"

Public Const ROLE_GUEST As String = "Guest"
Public Const ROLE_EMPLOYEE As String = "Employee"
Public Const ROLE_MANAGER As String = "Manager"
Public Const ROLE_ADMIN As String = "Admin"

Public Const VIEW_SHEET_NAME As String = "DB_Data"
Public Const DB_FILE_NAME As String = "Database_1.xlsm"
Public Const DB_FILE_WIN As String = "\\Mac\Home\Desktop\DB\planB\Database_1.xlsm"

Public Const ANCHOR_PROJECTS As String = "ANCHOR_PROJECTS"
Public Const ANCHOR_STAGES As String = "ANCHOR_STAGES"
Public Const ANCHOR_STAGEVALUES As String = "ANCHOR_STAGEVALUES"

Public Const TPROJ_COL_ProjectID As Long = 1
Public Const TSTAGES_COL_StageRowId As Long = 1
Public Const TSTAGES_COL_ProjectID As Long = 2
Public Const TVALUES_COL_StageRowId As Long = 1

Public Const ERR_APP_BASE As Long = vbObjectError + 512

' --- Queue / Packages (file-based inbox) ---
Public Const QUEUE_ROOT_WIN As String = "\\Mac\Home\Desktop\DB\Queue"
Public Const QUEUE_DIR_INBOX As String = "Inbox"
Public Const QUEUE_DIR_PROCESSED As String = "Processed"
Public Const QUEUE_DIR_REJECTED As String = "Rejected"
Public Const QUEUE_DIR_LOGS As String = "Logs"

' --- Server connection ---
Public Const SERVER_URL As String = "http://server:3000"
Public Const API_AUTH As String = "/api/auth"
Public Const API_PROJECTS As String = "/api/projects"
Public Const API_SUBMIT As String = "/api/submit"
Public Const API_REFERENCES As String = "/api/references"
