import { requestWithSession } from './auth';

export type Feedback = {
  id: string;
  category: string;
  message: string;
  rating: number | null;
  status: string;
  createdAt: string;
};

export type TicketSummary = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketMessage = { id: string; authorId: string; message: string; createdAt: string };
export type TicketDetails = TicketSummary & { description: string; messages: TicketMessage[] };

export const supportApi = {
  listFeedback: () => requestWithSession<Feedback[]>('/api/feedback'),
  createFeedback: (category: string, message: string, rating: number | null) =>
    requestWithSession<Feedback>('/api/feedback', { json: { category, message, rating } }),
  listTickets: () => requestWithSession<TicketSummary[]>('/api/support/tickets'),
  createTicket: (subject: string, description: string) =>
    requestWithSession<TicketDetails>('/api/support/tickets', { json: { subject, description } }),
  getTicket: (id: string) =>
    requestWithSession<TicketDetails>(`/api/support/tickets/${encodeURIComponent(id)}`),
  addMessage: (id: string, message: string) =>
    requestWithSession<TicketMessage>(`/api/support/tickets/${encodeURIComponent(id)}/messages`, {
      json: { message },
    }),
};
