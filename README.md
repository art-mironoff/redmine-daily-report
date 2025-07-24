# Redmine Daily Report

This Google Apps Script automates generating and sending daily reports based on Redmine time entries to a specified client email, including your Gmail signature.

### Setup Instructions:

1.  **Google Apps Script Project Setup:**
    *   Open [script.google.com](https://script.google.com/)
    *   Click "New project".
    *   Paste the provided script code.
    *   Save the project with a descriptive name.

2.  **Configuration:**
    *   In the script, update the `CONFIG` object with your details:
        *   `redmineUrl`: Your Redmine instance URL.
        *   `apiKey`: Your Redmine API key (find it in "My account" → "API access key").
        *   `userId`: Your Redmine user ID (found in your profile URL).
        *   `clientEmail`: The client's email address.
    *   Optionally, customize the email subject and add additional recipients.

3.  **Granting Permissions:**
    *   In the Google Apps Script editor, select the `testReport()` function from the dropdown menu.
    *   Run the `testReport()` function.
    *   Follow the prompts to authorize access to Gmail and external URLs.
    *   Verify that the report is sent correctly to ensure permissions are granted.

4.  **Setting Up Daily Trigger:**
    *   Select the `setupDailyTrigger()` function from the dropdown menu.
    *   Run the `setupDailyTrigger()` function **once**. This will create a daily trigger to send reports around 18:00 (6 PM).
    *   You can modify the trigger time by changing the `atHour` parameter in the script.

### Notes:

*   The script automatically sends error notifications to your email.
*   If there are no time entries for the day, no email will be sent.
