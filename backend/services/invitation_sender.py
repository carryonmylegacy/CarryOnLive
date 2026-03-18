"""CarryOn™ Backend — Shared invitation email sender

Reusable function that sends a beneficiary invitation email.
Called from auth.py (registration) and beneficiaries.py (add/save).
"""

import os
from datetime import datetime, timezone

import resend

from config import RESEND_API_KEY, SENDER_EMAIL, db, logger


async def send_invitation_email(beneficiary: dict, benefactor: dict):
    """Send an invitation email to a beneficiary.

    Args:
        beneficiary: dict with keys id, email, first_name, invitation_token
        benefactor: dict with keys name, first_name (or name split)
    """
    email = (beneficiary.get("email") or "").strip()
    if not email:
        return False

    invitation_token = beneficiary.get("invitation_token")
    if not invitation_token:
        return False

    benefactor_name = benefactor.get("name", "Your benefactor")
    benefactor_first = benefactor.get("first_name") or benefactor_name.split()[0]
    beneficiary_first = beneficiary.get("first_name") or "there"

    try:
        if RESEND_API_KEY:
            frontend_url = os.environ.get("FRONTEND_URL", "https://carryon.us")
            invitation_link = f"{frontend_url}/accept-invitation/{invitation_token}"

            email_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #d4af37; margin: 0;">CarryOn™</h1>
                    <p style="color: #666;">Secure Estate Planning</p>
                </div>

                <h2 style="color: #333;">You've Been Added to {benefactor_name}'s Estate</h2>

                <p style="color: #555; line-height: 1.6;">
                    Dear {beneficiary_first},
                </p>

                <p style="color: #555; line-height: 1.6;">
                    {benefactor_name} has added you as a beneficiary on CarryOn™, a secure estate planning platform.
                    This means they've chosen you to be part of their legacy planning.
                </p>

                <p style="color: #555; line-height: 1.6;">
                    <strong>What is CarryOn™?</strong><br>
                    CarryOn™ helps families prepare for life's transitions by securely storing important documents,
                    messages, and instructions that can be shared with loved ones at the appropriate time.
                </p>

                <p style="color: #555; line-height: 1.6;">
                    <strong>What should you do?</strong><br>
                    Click the button below to create your CarryOn™ account. This will allow you to:
                </p>

                <ul style="color: #555; line-height: 1.8;">
                    <li>View your connection to {benefactor_first}'s estate</li>
                    <li>Receive important updates and notifications</li>
                    <li>Access documents and messages when the time is right</li>
                </ul>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="{invitation_link}"
                       style="background: linear-gradient(135deg, #d4af37, #c5a028);
                              color: white;
                              padding: 14px 32px;
                              text-decoration: none;
                              border-radius: 8px;
                              font-weight: bold;
                              display: inline-block;">
                        Accept Invitation & Create Account
                    </a>
                </div>

                <p style="color: #888; font-size: 12px; line-height: 1.6;">
                    <strong>Note:</strong> At this time, you will not have access to any specific details about the estate.
                    This invitation simply connects you to {benefactor_first}'s CarryOn™ account for future reference.
                </p>

                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

                <p style="color: #888; font-size: 12px; text-align: center;">
                    If you didn't expect this email or have questions, please contact {benefactor_name} directly.
                </p>
            </div>
            """

            resend.Emails.send(
                {
                    "from": SENDER_EMAIL,
                    "to": email,
                    "subject": f"{benefactor_name} has added you to their CarryOn™ Estate",
                    "html": email_html,
                }
            )
            logger.info(f"Invitation email sent to {email}")
        else:
            logger.info(f"[DEV MODE] Invitation would be sent to {email} with token {invitation_token}")
    except Exception as e:
        logger.error(f"Failed to send invitation email to {email}: {e}")
        return False

    # Update beneficiary status
    now = datetime.now(timezone.utc).isoformat()
    await db.beneficiaries.update_one(
        {"id": beneficiary["id"]},
        {
            "$set": {
                "invitation_status": "sent",
                "invitation_token": invitation_token,
                "invitation_sent_at": now,
            }
        },
    )
    return True
