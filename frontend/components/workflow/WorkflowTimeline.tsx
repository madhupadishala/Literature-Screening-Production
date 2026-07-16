"use client";

import { useEffect, useState } from "react";

import WorkflowStatusBadge from "./WorkflowStatusBadge";

import styles from "./workflow.module.css";

import type {
  WorkflowTimelineEvent,
} from "@/lib/workflow/workflow-timeline-store";

type Props = {

  packageId: string;

};

export default function WorkflowTimeline({
  packageId,
}: Props) {

  const [events, setEvents] = useState<
    WorkflowTimelineEvent[]
  >([]);

  useEffect(() => {

    async function load() {

      const response = await fetch(
        `/api/workflow/timeline?packageId=${packageId}`,
      );

      const json = await response.json();

      setEvents(json.data);

    }

    load();

  }, [packageId]);

  return (

    <section className={styles.timelineContainer}>

      <h2>Workflow Timeline</h2>

      <div className={styles.timeline}>

        {events.map((event) => (

          <div
            key={event.id}
            className={styles.timelineRow}
          >

            <div className={styles.timelineDot} />

            <div className={styles.timelineContent}>

              <WorkflowStatusBadge
                stage={event.stage}
              />

              <strong>{event.action}</strong>

              <small>
                {event.performedBy}
              </small>

              <small>
                {new Date(
                  event.timestamp,
                ).toLocaleString()}
              </small>

              {event.comment && (
                <p>{event.comment}</p>
              )}

            </div>

          </div>

        ))}

      </div>

    </section>

  );

}