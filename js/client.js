C.client = (function () {

    var client = {

        isTouch: ('ontouchstart' in window),

        init: function () {

            C.log('Client: init');

            if (!this.isTouch) {

                this.width = 320;
                this.height = 548;
                $(document.body).addClass('desktop');

            }

            this.update();
            $(window).resize(function () {
                C.client.update();
            });

            // Modern browsers: just use unprefixed transform
            C.client.transformProperty = 'transform';
            C.client.transitionEndEvent = 'transitionend';

            // Fallback for older WebKit
            var s = document.body.style;
            if (!('transform' in s) && 'webkitTransform' in s) {
                C.client.transformProperty = 'webkitTransform';
                C.client.transitionEndEvent = 'webkitTransitionEnd';
            }

            C.client.isWebkit = 'webkitTransform' in s;

        },

        update: function () {

            if (this.isTouch) {

                this.width = window.innerWidth,
                this.height = window.innerHeight;
                if (C.currentCollection) {
                    C.currentCollection.updateBounds();
                }

            } else {

                var wrapper = C.$wrapper[0];
                this.top = wrapper.offsetTop;
                this.left = wrapper.offsetLeft;
                this.right = this.left + this.width;
                this.bottom = this.top + this.height;

            }

        }

    };

    return client;

}());
