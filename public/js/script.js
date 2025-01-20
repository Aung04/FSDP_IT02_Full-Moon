$(document).ready(function() {
    // Load the navbar and footer content dynamically
    $("#navbar-container").load("navbar.html");
    $("#footer-container").load("footer.html");

    // Check for stored user details in localStorage
    const userDetails = JSON.parse(localStorage.getItem('userDetails'));
    if (userDetails && userDetails.firstName) {
        displayWelcomeMessage(userDetails.firstName);
        checkAndResetTierForAccount(userDetails.accountId);
    }
});

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Fetch session details to check if the user is logged in
        const response = await fetch('/auth/check-session');
        const data = await response.json();

        if (data.isLoggedIn && data.firstName) {
            displayWelcomeMessage(data.firstName);
        } else {
            displayWelcomeMessage('Guest');
        }
    } catch (error) {
        console.error('Error fetching user session:', error);
        displayWelcomeMessage('Guest');
    }
});

function displayWelcomeMessage(firstName) {
    const welcomeMessageContainer = document.getElementById('welcomeMessage');
    welcomeMessageContainer.textContent = `Welcome, ${firstName}!`;
    welcomeMessageContainer.classList.add('welcome-text'); // Add CSS class for styling
}

async function checkAndResetTierForAccount(accountId) {
    try {
      console.log("accountId:", accountId);
      const response = await fetch(`/api/tier/${accountId}/checkMembership`, {
        method: 'PUT',
      });
  
      if (response.ok) {
        const data = await response.json();
        console.log(data.message);
  
        // Update localStorage if the tier was expired
        if (data.expired) {
          const updatedUserDetails = {
            ...JSON.parse(localStorage.getItem("userDetails")),
            membership: data.membership,
          };
          localStorage.setItem("userDetails", JSON.stringify(updatedUserDetails));
  
          // Display the message only if the tier was expired
          alert(data.message);
        }
      } else {
        console.error("Error resetting Membership for account:", response.statusText);
      }
    } catch (error) {
      console.error("Error resetting Membership for account:", error);
      alert("Error resetting Membership for account.");
    }
  }
  
