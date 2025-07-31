const CONFIG = {
    redmineUrl: 'https://redmine.example.com/', // Replace with your Redmine URL
    apiKey: 'YOUR_API_KEY', // Your Redmine API key
    userId: 'YOUR_USER_ID', // Your Redmine user ID
    clientEmail: 'client.email@example.com', // Client email
    subject: 'Daily Report', // Email subject
    customerName: 'Customer', // Customer name
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
    const timeEntries = data.time_entries || [];
    
    // Get detailed issue information for each time entry
    return timeEntries.map(entry => {
        if (entry.issue && entry.issue.id) {
            const issueDetails = getIssueDetails(entry.issue.id);
            return { ...entry, issueDetails };
        }
        return entry;
    });
}

/**
 * Get detailed issue information from Redmine API
 */
function getIssueDetails(issueId) {
    const url = `${CONFIG.redmineUrl}/issues/${issueId}.json?include=attachments,relations,changesets,journals,watchers`;
    
    const options = {
        method: 'GET',
        headers: {
            'X-Redmine-API-Key': CONFIG.apiKey,
            'Content-Type': 'application/json'
        }
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        
        if (response.getResponseCode() !== 200) {
            console.error(`Error fetching issue ${issueId}: ${response.getResponseCode()}`);
            return null;
        }

        const data = JSON.parse(response.getContentText());
        return data.issue;
    } catch (error) {
        console.error(`Error fetching issue ${issueId}:`, error);
        return null;
    }
}

/**
 * Generate HTML report
 */
function generateReportHtml(timeEntries, date, signature) {
    let totalHours = 0;

    let tableRows = '';
    timeEntries.forEach((entry, index) => {
        totalHours += entry.hours;
        const rowBgColor = index % 2 === 0 ? 'rgb(220,230,243)' : 'rgb(245,255,153)';
        const issue = entry.issueDetails;
        
        // Progress bar for % Done
        const donePercent = issue?.done_ratio || 0;
        const progressBar =
            `<div style="background:rgba(209,211,224,0.5);border-radius: 6px;height:12px;margin-top: 3px; position:relative;overflow:hidden;width:72px;">
                <div style="width:${donePercent}%;background: rgb(2,153,52);border-radius-top-left: 6px;border-radius-bottom-left: 6px;border-radius-bottom-left: 6px;border-radius-bottom-right: 6px;height:100%;"></div>
             </div>`;
        
        tableRows += `
        <tr style="height: 32px; text-align:center;background-color:${rowBgColor}">
          <td style="padding:6px;border:1px solid rgb(227,229,236);text-align:right;vertical-align:top;font-weight:600;">${entry.issue?.id || ''}</td>
          <td style="padding:6px;border:1px solid rgb(227,229,236);text-align:left;vertical-align:top;">${issue?.author?.name || ''}</td>
          <td style="padding:6px;border:1px solid rgb(227,229,236);text-align:left;vertical-align:top;">${issue?.tracker?.name || ''}</td>
          <td style="padding:6px;border:1px solid rgb(227,229,236);text-align:left;vertical-align:top;">${issue?.status?.name || ''}</td>
          <td style="padding:6px;border:1px solid rgb(227,229,236);text-align:left;vertical-align:top;">${issue?.priority?.name || ''}</td>
          <td style="padding:6px;border:1px solid rgb(227,229,236);text-align:left;vertical-align:top;">${issue?.assigned_to?.name || ''}</td>
          <td style="padding:6px;border:1px solid rgb(227,229,236);text-align:left;vertical-align:top;">
            ${issue?.id && issue?.subject 
              ? `<a href="${CONFIG.redmineUrl}issues/${issue.id}" style="background-color:transparent;color:rgb(0,81,204);text-decoration-line:none;font-weight:600" target="_blank">${issue.subject}</a>`
              : issue?.subject
            }
          </td>
          <td style="padding:6px;border:1px solid rgb(227,229,236);text-align:right;vertical-align:top;">${entry.hours}</td>
          <td style="padding:6px;border:1px solid rgb(227,229,236);vertical-align:top;">${progressBar}</td>
        </tr>
      `;
    });

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif;">
          <div>
            Hello ${CONFIG.customerName},<br/>
            <br/>
            Today I worked on:
          </div>
          
          <table style="border-spacing:0px;border-collapse:collapse;margin-bottom:0px;font-size:0.88em">
            <thead>
              <tr>
                <th style="padding:6px;border-style:solid;border-color:rgb(227,229,236);border-width:0px 0px 2px;color: #000000;vertical-align:bottom;text-align:right;">#</th>
                <th style="padding:6px;border-style:solid;border-color:rgb(227,229,236);border-width:0px 0px 2px;color: #000000;vertical-align:bottom;text-align:left;">Author</th>
                <th style="padding:6px;border-style:solid;border-color:rgb(227,229,236);border-width:0px 0px 2px;color: #000000;vertical-align:bottom;text-align:left;">Tracker</th>
                <th style="padding:6px;border-style:solid;border-color:rgb(227,229,236);border-width:0px 0px 2px;color: #000000;vertical-align:bottom;text-align:left;">Status</th>
                <th style="padding:6px;border-style:solid;border-color:rgb(227,229,236);border-width:0px 0px 2px;color: #000000;vertical-align:bottom;text-align:left;">Priority</th>
                <th style="padding:6px;border-style:solid;border-color:rgb(227,229,236);border-width:0px 0px 2px;color: #000000;vertical-align:bottom;text-align:left;">Assignee</th>
                <th style="padding:6px;border-style:solid;border-color:rgb(227,229,236);border-width:0px 0px 2px;color: #000000;vertical-align:bottom;text-align:left;">Subject</th>
                <th style="padding:6px;border-style:solid;border-color:rgb(227,229,236);border-width:0px 0px 2px;color: #000000;vertical-align:bottom;text-align:right;">Spent time</th>
                <th style="padding:6px;border-style:solid;border-color:rgb(227,229,236);border-width:0px 0px 2px;color: #000000;vertical-align:bottom;">% Done</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr style="font-weight: bold;background-color:rgb(249,249,249);">
                <td colspan="7" style="padding:6px;border:1px solid rgb(227,229,236);text-align:right;vertical-align:top;">Total:</td>
                <td style="padding:6px;border:1px solid rgb(227,229,236);text-align:right;vertical-align:top;">${totalHours}</td>
                <td style="padding:6px;border:1px solid rgb(227,229,236);vertical-align:top;"></td>
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