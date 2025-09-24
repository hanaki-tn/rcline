import Queue from 'bull';

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

export function createQueue() {
  const linkFollowQueue = new Queue('link follow', REDIS_URL);
  const linkUnfollowQueue = new Queue('link unfollow', REDIS_URL);

  // ジョブ処理設定
  linkFollowQueue.process('link_follow', async (job) => {
    const { linkFollowProcessor } = await import('./processors/linkFollow.js');
    return linkFollowProcessor(job.data);
  });

  linkUnfollowQueue.process('link_unfollow', async (job) => {
    const { linkUnfollowProcessor } = await import('./processors/linkUnfollow.js');
    return linkUnfollowProcessor(job.data);
  });

  linkFollowQueue.on('completed', (job, result) => {
    console.log(`LinkFollow Job ${job.id} completed:`, result);
  });

  linkFollowQueue.on('failed', (job, err) => {
    console.error(`LinkFollow Job ${job.id} failed:`, err);
  });

  linkUnfollowQueue.on('completed', (job, result) => {
    console.log(`LinkUnfollow Job ${job.id} completed:`, result);
  });

  linkUnfollowQueue.on('failed', (job, err) => {
    console.error(`LinkUnfollow Job ${job.id} failed:`, err);
  });

  return {
    linkFollow: linkFollowQueue,
    linkUnfollow: linkUnfollowQueue
  };
}