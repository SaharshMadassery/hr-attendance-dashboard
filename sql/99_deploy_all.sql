/* =====================================================================
   99_deploy_all.sql — run the folder in order.

   THIS FILE HAS NOT BEEN RUN. Every object below is a definition on
   disk only; nothing was created on the server while this application
   was written. Deploying is a decision for whoever owns the database.

   What it creates: one schema (hrv2), one inline function and six
   stored procedures. It creates no tables, alters nothing existing and
   moves no data. Every procedure body is a SELECT.

   To deploy with sqlcmd:
       sqlcmd -S db.example.internal -d HR_STAGING -U <login> -P <password> \
              -i 01_schema.sql -i 02_fn_open_days.sql \
              -i 03_usp_AcademicYear.sql -i 04_usp_EmployeeList.sql \
              -i 05_usp_AttendanceSummary.sql -i 06_usp_AttendanceByEmployee.sql \
              -i 07_usp_AttendanceByDepartment.sql -i 08_usp_EmployeeMonths.sql

   Then review and run 09_grants.sql after creating the application login.

   To remove everything this application added:
       DROP PROCEDURE hrv2.usp_EmployeeMonths;
       DROP PROCEDURE hrv2.usp_AttendanceByDepartment;
       DROP PROCEDURE hrv2.usp_AttendanceByEmployee;
       DROP PROCEDURE hrv2.usp_AttendanceSummary;
       DROP PROCEDURE hrv2.usp_EmployeeList;
       DROP PROCEDURE hrv2.usp_AcademicYear;
       DROP FUNCTION  hrv2.fn_OpenDays;
       DROP SCHEMA    hrv2;
   ===================================================================== */
:r 01_schema.sql
:r 02_fn_open_days.sql
:r 03_usp_AcademicYear.sql
:r 04_usp_EmployeeList.sql
:r 05_usp_AttendanceSummary.sql
:r 06_usp_AttendanceByEmployee.sql
:r 07_usp_AttendanceByDepartment.sql
:r 08_usp_EmployeeMonths.sql
