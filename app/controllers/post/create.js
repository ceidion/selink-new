// Create post
// ---------------------------------------------
// Create new post, and return the newly created post
// ---------------------------------------------
// 1. create post with content and group
//   2. save the post pointer in author profile
//   3. save the post pointer in group profile
//   4. create author activity
//   5. create notification for author's friends
//     6. send real-time notification to author's friends
//   7. send email notification to author's friends
//   8. create notification for group's participants
//     9. sent real-time notification to group's participants
//   10. send email notification to group's participants
//   11. commit post to solr
//   12. return the new post to client

var _ = require('underscore'),
    async = require('async'),
    mongoose = require('mongoose'),
    Post = mongoose.model('Post'),
    User = mongoose.model('User'),
    Group = mongoose.model('Group'),
    Activity = mongoose.model('Activity'),
    Notification = mongoose.model('Notification'),
    Mailer = require('../../mailer/mailer.js');

var populateField = {
    '_owner': 'type firstName lastName title cover photo',
    'comments._owner': 'type firstName lastName title cover photo',
    'group': 'name cover description'
};

module.exports = function(req, res, next) {

    async.waterfall([

        // // before save the post, extract the inlined base64 picture
        // function preProcess(callback) {

        //     var capture = /"data:image\/(.*?);base64,(.+?)"/g;
        //         data = capture.exec(req.body.content);

        //     while(data) {

        //         var tempName = temp.path({suffix: '.' + data[1]});

        //         console.log(tempName);

        //         fs.writeFile(tempName, data[2], 'base64');
        //     }

        //     callback(null, req.body.content);
        // },

        // create post
        function createPost(callback) {

            Post.create({
                _owner: req.user.id,
                group: req.body.group,
                content: req.body.content
            }, callback);
        },

        // create relate information
        function createRelateInfo(post, callback) {

            async.parallel({

                // save the post id in user profile
                updateUser: function(callback) {
                    req.user.posts.addToSet(post.id);
                    req.user.save(callback);
                },

                // save the post id in group profile
                updateGroup: function(callback) {

                    if (req.body.group)
                        // save the post id in group profile
                        Group.findByIdAndUpdate(req.body.group, {$addToSet: {posts: post.id}}, callback);
                    else
                        callback(null);
                },

                // create activity
                createActivity: function(callback) {

                    Activity.create({
                        _owner: req.user.id,
                        type: 'post-new',
                        targetPost: post.id,
                        targetGroup: req.body.group
                    }, callback);
                },

                // send notificaton to all friends
                createNotification: function(callback) {

                    if (req.user.friends && req.user.friends.length)
                        Notification.create({
                            _owner: req.user.friends,
                            _from: req.user.id,
                            type: 'post-new',
                            targetPost: post.id,
                            targetGroup: req.body.group
                        }, callback);
                    else
                        callback(null);
                },

                // index this post in solr
                createSolr: function(callback) {

                    solr.add(post.toSolr(), function(err, result) {
                        if (err) callback(err);
                        else solr.commit(callback);
                    });
                }

            }, function(err, results) {

                if (err) callback(err);
                else callback(null, post, results.updateGroup, results.createNotification);
            });
        },

        function sendMessages(post, group, notification, callback) {

            var postObj = post.toObject(), // this object is the full representation of post, only used for return
                notifiedUser = req.user.friends,
                owner = {
                    _id: req.user.id,
                    type: req.user.type,
                    firstName: req.user.firstName,
                    lastName: req.user.lastName,
                    title: req.user.title,
                    cover: req.user.cover,
                    photo: req.user.photo
                };

            // manually populate post owner
            postObj._owner = owner;

            // if the post belong to some group
            if (group) {
                // manually populate post group (as needed)
                postObj.group = {
                    _id: group.id,
                    name: group.name,
                    cover: group.cover,
                    description: group.description
                };

                // --------- this is NOT working :---------------
                // notifiedUser = _.union(req.user.friends, _.without(group.participants, req.user.id));
                // ----------------- Because :-------------------
                // intersection uses simple reference equality to compare the elements, rather than comparing their contents.
                // To compare two ObjectIds for equality you need to use the ObjectId.equals method.
                // So the simplest solution would be to convert the arrays to strings so that intersection will work.
                // ----------------------------------------------

                // change the notification receiver to group members + friends
                group.participants.forEach(function(participant) {
                    // note that I use user's '_id', cause the participant is an ObjectId (object).
                    // remember that the 'id' is the string representation of '_id'
                    if (!_.isEqual(participant, req.user._id))
                        notifiedUser.addToSet(participant);
                });
            }

            // send real time message to friends
            notifiedUser.forEach(function(room) {
                sio.sockets.in(room).emit('post-new', {
                    _id: notification.id,
                    _from: owner,
                    type: 'post-new',
                    targetPost: post,
                    targetGroup: group,
                    createDate: new Date()
                });
            });

            // send email to all friends
            User.find()
                .select('email')
                .where('_id').in(notifiedUser)
                .where('mailSetting.newPost').equals(true)
                .where('logicDelete').equals(false)
                .exec(function(err, recipients) {

                    if (err) callback(err);
                    // send new-post mail
                    else if (recipients) Mailer.newPost(recipients, req.user, post, group);
                });

            // the last result is the created post
            callback(null, postObj);
        }

    ], function(err, post) {

        if (err) next(err);
        // return the created post
        else res.json(post);
    });

};