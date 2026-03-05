'use server';
/**
 * @fileOverview A Genkit flow for sending user invitation emails.
 *
 * - sendInviteEmail - A function that handles sending an invitation email.
 * - SendInviteEmailInput - The input type for the sendInviteEmail function.
 * - SendInviteEmailOutput - The return type for the sendInviteEmail function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SendInviteEmailInputSchema = z.object({
  email: z.string().email().describe('The email address of the user to invite.'),
  organisationName: z.string().describe('The name of the organisation the user is being invited to.'),
  roleName: z.string().describe('The role the user is being invited to.'),
  organisationId: z.string().describe('The ID of the organisation.'),
  roleId: z.string().describe('The ID of the role being assigned.'),
});
export type SendInviteEmailInput = z.infer<typeof SendInviteEmailInputSchema>;

const EmailContentSchema = z.object({
    subject: z.string().describe('The subject line of the email.'),
    body: z.string().describe('The HTML body of the email.'),
    inviteUrl: z.string().describe('The sign-up URL for the user.'),
});

const SendInviteEmailOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  inviteUrl: z.string().optional(),
});
export type SendInviteEmailOutput = z.infer<typeof SendInviteEmailOutputSchema>;

export async function sendInviteEmail(input: SendInviteEmailInput): Promise<SendInviteEmailOutput> {
  return sendInviteEmailFlow(input);
}

const emailPrompt = ai.definePrompt({
    name: 'generateInviteEmailPrompt',
    input: { schema: SendInviteEmailInputSchema },
    output: { schema: EmailContentSchema },
    prompt: `You are an assistant that generates professional user invitation emails.

Generate an email to invite a new user to an organisation on the HelmLogic platform.

The user's email is: {{{email}}}
The organisation is: {{{organisationName}}}
The user's role will be: {{{roleName}}}

The email should be welcoming and clearly state the purpose of the invitation. It must include a call-to-action link to sign up. The link should be: \`http://localhost:9002/signup?org_id={{{organisationId}}}&role_id={{{roleId}}}&email={{{email}}}\`. 
Respond with the subject, body, and the inviteUrl explicitly.
`,
});


const sendInviteEmailFlow = ai.defineFlow(
  {
    name: 'sendInviteEmailFlow',
    inputSchema: SendInviteEmailInputSchema,
    outputSchema: SendInviteEmailOutputSchema,
  },
  async (input) => {
    try {
        const { output } = await emailPrompt(input);
        if (!output) {
            throw new Error('Failed to generate email content.');
        }

        // In a real application, you would integrate with an email sending service
        // like SendGrid, Mailgun, or AWS SES here.
        // For this example, we'll just log the email to the console to simulate sending.
        console.log('--- SIMULATING EMAIL SEND ---');
        console.log(`To: ${input.email}`);
        console.log(`Subject: ${output.subject}`);
        console.log(`Invite URL: ${output.inviteUrl}`);
        console.log('-----------------------------');

        return {
            success: true,
            message: `An invitation email has been sent to ${input.email}.`,
            inviteUrl: output.inviteUrl,
        };

    } catch (error) {
        console.error('Error in sendInviteEmailFlow:', error);
        return {
            success: false,
            message: 'There was an error sending the invitation email.',
        };
    }
  }
);
