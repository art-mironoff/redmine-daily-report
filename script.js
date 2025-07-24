const CONFIG = {
    redmineUrl: 'https://redmine.example.com/', // Replace with your Redmine URL
    apiKey: 'YOUR_API_KEY', // Your Redmine API key
    userId: 'YOUR_USER_ID', // Your Redmine user ID
    clientEmail: 'client.email@example.com', // Client email
    subject: 'Daily Report', // Email subject
    ccEmails: [], // Additional recipients (optional)
};

/**
 * Main function to send the daily report
 */
function sendDailyReport() {
    try {
        const today = new Date();
        const timeEntries = getTimeEntriesForDate(today);

        if (timeEntries.length === 0) {
            console.log('No time entries for today');
            return;
        }

        const signature = getGmailSignature();
        if (!signature) {
            console.log('Gmail signature not found. Report will not be sent.');
            sendErrorNotification(new Error('Gmail signature not found. Please check your Gmail signature settings.'));
            return;
        }

        const reportHtml = generateReportHtml(timeEntries, today, signature);
        sendEmailReport(reportHtml, today);

        console.log('Report successfully sent');
    } catch (error) {
        console.error('Error sending report:', error);
        // Optional: send error notification to yourself
        sendErrorNotification(error);
    }
}

/**
 * Get Gmail signature from settings
 */
function getGmailSignature() {
    try {
        // Get Gmail settings
        const settings = Gmail.Users.Settings.SendAs.list('me');
        
        // Find the primary email address (usually the first one or marked as primary)
        let primarySendAs = null;
        for (const sendAs of settings.sendAs) {
            if (sendAs.isPrimary || sendAs.isDefault) {
                primarySendAs = sendAs;
                break;
            }
        }
        
        // If no primary found, use the first one
        if (!primarySendAs && settings.sendAs.length > 0) {
            primarySendAs = settings.sendAs[0];
        }
        
        // Return signature if exists
        if (primarySendAs && primarySendAs.signature) {
            return primarySendAs.signature;
        }
        
        console.log('No signature found, using default');
        return null;
        
    } catch (error) {
        console.error('Error getting Gmail signature:', error);
        return null;
    }
}

/**
 * Get time entries from Redmine for the specified date
 */
function getTimeEntriesForDate(date) {
    const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    const url = `${CONFIG.redmineUrl}/time_entries.json?user_id=${CONFIG.userId}&spent_on=${dateStr}&limit=100`;

    const options = {
        method: 'GET',
        headers: {
            'X-Redmine-API-Key': CONFIG.apiKey,
            'Content-Type': 'application/json'
        }
    };

    const response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() !== 200) {
        throw new Error(`Redmine API error: ${response.getResponseCode()}`);
    }

    const data = JSON.parse(response.getContentText());
    return data.time_entries || [];
}

/**
 * Generate HTML report
 */
function generateReportHtml(timeEntries, date, signature) {
    const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd.MM.yyyy');
    let totalHours = 0;

    let tableRows = '';
    timeEntries.forEach(entry => {
        totalHours += entry.hours;
        tableRows += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${entry.project.name}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${entry.issue ? `#${entry.issue.id}` : '-'}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${entry.activity.name}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${entry.comments || '-'}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${entry.hours} ч</td>
        </tr>
      `;
    });

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif;">
          <h2>Report for ${dateStr}</h2>
          
          <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f2f2f2;">
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Project</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Issue</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Activity</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Comment</th>
                <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Time</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr style="background-color: #f9f9f9; font-weight: bold;">
                <td colspan="4" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total:</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${totalHours} ч</td>
              </tr>
            </tfoot>
          </table>
          
          <div style="margin-top: 30px;">
            ${signature}
          </div>
        </body>
      </html>
    `;

    return html;
}

/**
 * Send email report
 */
function sendEmailReport(htmlContent, date) {
    const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd.MM.yyyy');
    const subject = `${CONFIG.subject} - ${dateStr}`;

    const options = {
        htmlBody: htmlContent,
        cc: CONFIG.ccEmails.join(',')
    };

    GmailApp.sendEmail(CONFIG.clientEmail, subject, '', options);
}

/**
 * Send error notification
 */
function sendErrorNotification(error) {
    const subject = 'Error in Redmine daily report';
    const body = `An error occurred while generating the daily report:\n\n${error.toString()}\n\nTime: ${new Date()}`;

    GmailApp.sendEmail(Session.getActiveUser().getEmail(), subject, body);
}

/**
 * Function for testing (run manually to check)
 */
function testReport() {
    console.log('Testing report...');
    sendDailyReport();
}

/**
 * Function to set up a daily trigger
 * Run once to create an automatic schedule
 */
function setupDailyTrigger() {
    // Delete existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'sendDailyReport') {
            ScriptApp.deleteTrigger(trigger);
        }
    });

    // Create a new trigger (every day at 6 PM)
    ScriptApp.newTrigger('sendDailyReport')
        .timeBased()
        .everyDays(1)
        .atHour(18) // Change time as needed
        .create();

    console.log('Daily trigger set for 6 PM');
}