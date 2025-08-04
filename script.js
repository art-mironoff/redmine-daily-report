const CONFIG = {
    redmineUrl: 'https://redmine.example.com/', // Replace with your Redmine URL
    apiKey: 'YOUR_API_KEY', // Your Redmine API key
    userId: 'YOUR_USER_ID', // Your Redmine user ID
    senderName: 'John Smith', // Your name to display in "from" field. Example: John Smith <john.smith@gmail.com>
    toEmail: [
        'John Smith <john.smith@example.com>',
        'Jane Doe <jane.doe@example.com>'
    ], // Customer emails with names in format "Name <email>"
    ccEmails: [], // Additional recipients with names in format "Name <email>" (optional)
    subjectText: 'Daily Report', // Email subject
    subjectDateFormat: 'MM_dd_yy', // Date format for email subject
    customerName: 'Customer', // Customer name used in email greeting.
    projects: [], // Project IDs or names to include in report. Empty array = all projects
    enableValidation: true, // Enable/disable time validation (check if total hours equals exactly 8 hours)
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

        // Validate time entries if enabled
        if (CONFIG.enableValidation) {
            const validationResult = validateTimeEntries(timeEntries);
            if (!validationResult.isValid) {
                console.log('Validation failed:', validationResult.error);
                sendValidationErrorNotification(validationResult.error, validationResult.totalHours);
                return;
            }
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
 * Validate time entries (check if total hours equals exactly 8 hours)
 */
function validateTimeEntries(timeEntries) {
    const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0);
    const requiredHours = 8;
    
    if (totalHours !== requiredHours) {
        const errorType = totalHours < requiredHours ? 'less than' : 'more than';
        return {
            isValid: false,
            error: `Total logged time (${totalHours} hours) is ${errorType} required (${requiredHours} hours)`,
            totalHours: totalHours
        };
    }
    
    return {
        isValid: true,
        totalHours: totalHours
    };
}

/**
 * Send validation error notification
 */
function sendValidationErrorNotification(errorMessage, totalHours) {
    const subject = 'Daily Report Validation Error';
    const body = `
Daily report was not sent due to validation error:

${errorMessage}

Please check your time entries and ensure they don't exceed 8 hours per day.

Time: ${new Date()}
    `.trim();

    const options = {
        name: CONFIG.senderName
    };

    GmailApp.sendEmail(Session.getActiveUser().getEmail(), subject, body, options);
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
    let timeEntries = data.time_entries || [];
    
    // Filter by projects if specified
    if (CONFIG.projects && CONFIG.projects.length > 0) {
        timeEntries = timeEntries.filter(entry => {
            if (!entry.project) {
                return false;
            }

            return CONFIG.projects.some(projectFilter => {
                // Support filtering by project ID or name
                return projectFilter == entry.project.id || projectFilter === entry.project.name;
            });
        });
    }

    // Get detailed issue information only for filtered entries
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
        const issue = entry.issueDetails;

        const completedStatuses = ['Resolved', 'Closed', 'Deployed'];
        const isCompleted = issue?.status?.name && completedStatuses.includes(issue.status.name);
        const rowBgColor = isCompleted ? 'rgb(245,255,153)' : 'rgb(220,230,243)';
        
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
    const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), CONFIG.subjectDateFormat);
    const subject = `${CONFIG.subjectText} ${dateStr}`;

    const options = {
        htmlBody: htmlContent,
        cc: CONFIG.ccEmails.join(','),
        name: CONFIG.senderName // This adds your name to the "from" field. Example: John Smith <john.smith@gmail.com>
    };

    GmailApp.sendEmail(CONFIG.toEmail.join(','), subject, '', options);
}

/**
 * Send error notification
 */
function sendErrorNotification(error) {
    const subject = 'Error in Redmine daily report';
    const body = `An error occurred while generating the daily report:\n\n${error.toString()}\n\nTime: ${new Date()}`;

    const options = {
        name: CONFIG.senderName // This adds your name to the "from" field. Example: John Smith <john.smith@gmail.com>
    };

    GmailApp.sendEmail(Session.getActiveUser().getEmail(), subject, body, options);
}
