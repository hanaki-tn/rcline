import Queue from 'bull';

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

export function createQueue() {
  const linkFollowQueue = new Queue('link follow', REDIS_URL);
  
  // ジョブ処理設定
  linkFollowQueue.process('link_follow', async (job) => {
    const { linkFollowProcessor } = await import('./processors/linkFollow.js');
    return linkFollowProcessor(job.data);
  });

  linkFollowQueue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed:`, result);
  });

  linkFollowQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err);
  });

  return {
    linkFollow: linkFollowQueue
  };
}