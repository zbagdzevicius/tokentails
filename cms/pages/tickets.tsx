'use client';

import { TICKET_API } from '@/api/ticket-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ITicket } from '@/models/ticket';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

export const Ticket = ({
  ticket,
  onAnswer
}: {
  ticket: ITicket;
  onAnswer: () => void;
}) => {
  const [answer, setAnswer] = useState(ticket.answer);
  if (!ticket) return <></>;
  return (
    <div>
      <h1>
        X - {ticket.user?.twitter} AND email - {ticket.user?.email} AND spent ={' '}
        {(ticket.user?.spent || 0).toFixed(0)}
      </h1>
      <h1>MESSAGE: {ticket.message}</h1>
      <h1>{ticket.answer}</h1>
      <Input
        value={answer}
        placeholder="YOUR REPLY"
        onChange={(e) => {
          setAnswer(e.target.value);
        }}
      />
      <Button
        onClick={async () => {
          await TICKET_API.ticketEdit({ answer, _id: ticket._id });
          onAnswer();
        }}
      >
        Answer
      </Button>
    </div>
  );
};

export default function UsersPage() {
  const [page, setPage] = useState(0);
  const { data: tickets, refetch } = useQuery({
    queryKey: ['shelter', page],
    queryFn: () => TICKET_API.ticketsFetch({ page })
  });

  return (
    <div defaultValue="all">
      <div className="flex flex-col gap-4">
        {tickets?.map((ticket) => (
          <Ticket
            key={ticket._id}
            ticket={ticket}
            onAnswer={() => {
              refetch();
            }}
          />
        ))}
      </div>
      <div className="flex justify-center mt-4">
        <Button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="mx-1"
        >
          Previous
        </Button>
        <span className="mx-2 flex items-center">
          Page {page + 1}{' '}
          {tickets && tickets.length === 0 && '(No more tickets)'}
        </span>
        <Button
          onClick={() => setPage(page + 1)}
          disabled={tickets && tickets.length === 0}
          className="mx-1"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
