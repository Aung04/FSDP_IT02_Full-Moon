document.addEventListener('DOMContentLoaded', function() {
    getProgrammeInfo();
    // displayProgrammeInfo(programmes);
});

async function getProgrammeInfo() {
  try {
      const response = await fetch('/api/programme/upcoming');
      
      // Ensure the response is successful
      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Ensure data is an array before calling the display function
      if (Array.isArray(data)) {
          displayProgrammeInfo(data);
      } else {
          console.error('Data is not an array:', data);
      }
  } catch (error) {
      console.error('Error fetching programme info:', error);
  }
}

function displayProgrammeInfo(programmes) {
  const container = document.querySelector('.upcoming-schedule'); 
  container.innerHTML = ''; // Clear previous content

  // Check if programmes is valid and not empty
  if (!Array.isArray(programmes) || programmes.length === 0) {
      container.innerHTML = '<p>No upcoming programmes found.</p>';
      return;
  }

  // Add header
  const h2 = document.createElement('h2');
  h2.innerHTML = 'Upcoming Classes';
  container.appendChild(h2);

  let row = document.createElement('div');
  row.classList.add('row');

  programmes.forEach((programme, index) => {
    console.log(programme);
      // Create a programme card
      const programmeInfo = document.createElement('div');
      programmeInfo.classList.add('col-md-4');

      const hasHostLink = programme.HostMeetingLink && programme.HostMeetingLink.trim() !== '';

      // Build the inner HTML conditionally
      programmeInfo.innerHTML = `
          <div class="schedule-card p-3 mb-4">
              <h5 class="programme-name">${programme.ProgrammeName || 'No Name'}</h5>
              <p class="programme-description mb-2">${programme.Description || 'No description available'}</p>
              <p class="start-date-time mb-2"><i class="bi bi-calendar-event"></i> ${programme.StartDateTime || 'N/A'}</p>
              <p class="end-date-time mb-2"><i class="bi bi-calendar-check"></i> ${programme.EndDateTime || 'N/A'}</p>
              <p class="programme-level mb-2"><i class="bi bi-mortarboard-fill"></i> ${programme.ProgrammeLevel || 'N/A'}</p>
              <p class="programme-location mb-2"><i class="bi bi-geo-alt-fill"></i> ${programme.Location || 'N/A'}</p>
              ${hasHostLink ? `
                <div class="link-wrapper">
                    <label class="mb-1 d-block">Host Link</label>
                    <div class="d-flex align-items-center">
                        <input type="text" class="form-control flex-grow-1" value="${programme.HostMeetingLink || ''}" readonly>
                        <button class="btn btn-secondary ms-2 copy-btn">Copy</button>
                    </div>
                </div>
                <div class="link-wrapper">
                    <label class="mb-1 d-block">Viewer Link</label>
                    <div class="d-flex align-items-center">
                        <input type="text" class="form-control flex-grow-1" value="${programme.ViewerMeetingLink || ''}" readonly>
                        <button class="btn btn-secondary ms-2 copy-btn">Copy</button>
                    </div>
                </div>
              ` : `
                  
                  <button 
                      class="btn btn-primary mt-3 create-meeting-btn" 
                      data-programme-class-id="${programme.ProgrammeClassID || ''}"
                      data-instance-id="${programme.InstanceID || ''}"
                      data-end-date-time="${programme.EndDateTime || ''}"
                  >
                      Join Meeting
                  </button>
              `}
          </div>
      `;

      row.appendChild(programmeInfo);

      // Append the current row to the container and start a new row every 3 programmes
      if ((index + 1) % 3 === 0 || index === programmes.length - 1) {
          container.appendChild(row);
          row = document.createElement('div');
          row.classList.add('row');
      }
  });
}

document.addEventListener('click', function (event) {
    if (event.target.classList.contains('copy-btn')) {
        const input = event.target.previousElementSibling; // Get the associated input field
        input.select();
        document.execCommand('copy');
        alert('Link copied to clipboard!');
    }
});


document.querySelector('.upcoming-schedule').addEventListener('click', async (event) => {
  if (event.target.classList.contains('create-meeting-btn')) {
      const button = event.target;

      // Hide the button
      button.style.display = 'none';

      // Get the meeting links (assuming you have these values available in your context)
      const programmeClassID = button.dataset.programmeClassId;
      const instanceID = button.dataset.instanceId;
      const endDateTime = button.dataset.endDateTime;

      console.log("programmeClassID:", programmeClassID);
      console.log("instanceID:", instanceID);
      console.log("endDateTime:", endDateTime);

      // Call the backend API to create the meeting
      try {
          const response = await fetch('/api/meeting/create', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  programmeClassID,
                  endDateTime,
                  instanceID,
              }),
          });

          const data = await response.json();

          if (response.ok) {
              // Create the Host Link and Viewer Link textboxes with "Copy" buttons
              const parent = button.parentElement;
              const hostLinkWrapper = createLinkWrapper('Host Link', data.hostMeetingLink);
              const viewerLinkWrapper = createLinkWrapper('Viewer Link', data.viewerMeetingLink);

              // Append the textboxes to the card
              parent.appendChild(hostLinkWrapper);
              parent.appendChild(viewerLinkWrapper);
          } else {
              console.error("Error creating meeting:", data.message);
              alert('Error creating meeting. Please try again.');
          }
      } catch (error) {
          console.error("Error creating meeting:", error);
          alert('Error creating meeting. Please try again.');
      }
  }
});

// Helper function to create link textboxes with copy button
function createLinkWrapper(label, defaultValue) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('link-wrapper', 'mt-3');

    // Add label and textbox layout
    wrapper.innerHTML = `
        <label class="mb-1 d-block">${label}</label>
        <div class="d-flex align-items-center">
            <input type="text" class="form-control flex-grow-1" value="${defaultValue}" readonly style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            <button class="btn btn-secondary ms-2 copy-btn">Copy</button>
        </div>
    `;

    // Add event listener to "Copy" button
    wrapper.querySelector('.copy-btn').addEventListener('click', function () {
        const input = wrapper.querySelector('input');
        input.select();
        document.execCommand('copy');
        alert(`${label} copied to clipboard!`);
    });

    return wrapper;
}


// Add event listeners to "Create Meeting" buttons
// async function createAndJoinMeeting(programmeClassID, endDateTime, instanceID) {
//     try {
//       // Send request to the backend to create/update the meeting link
//       const response = await fetch('/api/meeting/create', {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({ programmeClassID, endDateTime, instanceID }),
//       });
  
//       // Handle the response
//       if (response.ok) {
//         const data = await response.json();
  
//         if (data.hostMeetingLink) {
//           console.log("Meeting created successfully. Redirecting to the meeting...");
  
//           // Automatically redirect the user to the meeting link
//           // window.location.href = data.hostMeetingLink;
//           // Open the meeting link in a new tab
//           window.open(data.hostMeetingLink, '_blank');
//         } else {
//           alert("Meeting link not returned. Please try again.");
//         }
//       } else {
//         console.error('Failed to create meeting:', response.statusText);
//         alert("Failed to create the meeting. Please contact support.");
//       }
//     } catch (error) {
//       console.error("Error creating/joining the meeting:", error);
//       alert("An error occurred while creating/joining the meeting.");
//     }
//   }
  
  // Example Usage
//   const programmeClassID = 1; // Replace with actual ID
//   const instanceID = 101; // Replace with actual instance ID
//   const endDateTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1-hour duration
  
  // Call the function
//   createAndJoinMeeting(programmeClassID, endDateTime, instanceID);
  